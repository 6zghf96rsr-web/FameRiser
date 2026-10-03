// FR-AI-04A integration gate. Requires a disposable local PostgreSQL cluster
// and two independent psql connections; never points at the production DB.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

function targetFromEnvironment(source = process.env) {
  if (source.RANKING_PILOT_DISPOSABLE !== "YES") {
    throw new Error("Set RANKING_PILOT_DISPOSABLE=YES for a disposable test cluster");
  }
  const raw = source.RANKING_PILOT_TEST_URL;
  if (!raw) throw new Error("RANKING_PILOT_TEST_URL is required");
  let url;
  try { url = new URL(raw); } catch { throw new Error("Invalid PostgreSQL test URL"); }
  if (!(["postgres:", "postgresql:"].includes(url.protocol)) ||
      !(["127.0.0.1", "[::1]"].includes(url.hostname)) ||
      url.search || url.hash) {
    throw new Error("Test URL must use PostgreSQL on loopback without query or fragment");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^fr_ai_pilot_[a-z0-9_]+$/.test(database)) {
    throw new Error("Disposable database name must start with fr_ai_pilot_");
  }
  if (!url.username) throw new Error("Test URL requires an explicit database role");
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid test port");
  const env = { ...source };
  for (const name of ["PGSERVICE", "PGOPTIONS", "PGHOSTADDR", "PGHOST", "PGPORT",
    "PGDATABASE", "PGUSER", "PGPASSWORD", "PGAPPNAME"]) delete env[name];
  env.PGHOST = url.hostname === "[::1]" ? "::1" : url.hostname;
  env.PGPORT = String(port);
  env.PGDATABASE = database;
  env.PGUSER = decodeURIComponent(url.username);
  env.PGPASSWORD = decodeURIComponent(url.password);
  env.PGCONNECT_TIMEOUT = "5";
  return { env, database };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const psqlArgs = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];

function startSql(env, sql, appName = "fr_ai_race", keepOpen = false) {
  const child = spawn("psql", psqlArgs, {
    env: { ...env, PGAPPNAME: appName }, stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let ended = false;
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const done = new Promise((resolve) => {
    child.on("error", (error) => { stderr += error.message; });
    child.on("close", (code) => { ended = true; resolve({ code, stdout, stderr }); });
  });
  child.stdin.write(`set statement_timeout = '25s'; set lock_timeout = '20s';\n${sql}\n`);
  if (!keepOpen) child.stdin.end();
  return {
    child,
    done,
    output: () => stdout,
    ended: () => ended,
    send: (statement, close = false) => {
      child.stdin.write(`${statement}\n`);
      if (close) child.stdin.end();
    },
  };
}

async function finished(run) {
  const result = await run.done;
  if (result.code !== 0) throw new Error(`psql failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

async function sql(env, body, appName) {
  return finished(startSql(env, body, appName));
}

async function marker(run, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (run.output().includes(label)) return;
    if (run.ended()) throw new Error(`Session ended before marker ${label}`);
    await delay(50);
  }
  throw new Error(`Timed out waiting for marker ${label}`);
}

async function locked(env, appName) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const wait = await sql(env,
      `select wait_event_type || ':' || wait_event from pg_stat_activity
       where application_name = '${appName}' and wait_event_type = 'Lock'`);
    if (wait) return wait;
    await delay(100);
  }
  throw new Error(`Second session ${appName} did not demonstrably wait on a PostgreSQL lock`);
}

let gateNumber = 804000;
async function gatedSession(env, name, mutation, end = "commit") {
  const gate = gateNumber++;
  const controller = startSql(env,
    `select pg_advisory_lock(${gate}); select 'GATE_${name}';`, `${name}_gate`, true);
  await marker(controller, `GATE_${name}`);
  const a = startSql(env,
    `begin; ${mutation}; select 'READY_${name}'; select pg_advisory_lock(${gate});
     select pg_advisory_unlock(${gate}); ${end};`, `${name}_a`);
  return {
    a,
    release: async () => {
      controller.send(`select pg_advisory_unlock(${gate});`, true);
      await finished(controller);
    },
    cleanup: () => {
      if (!a.ended()) a.child.kill("SIGTERM");
      if (!controller.ended()) controller.child.kill("SIGTERM");
    },
  };
}

async function heldPair(env, name, firstStatement, secondStatement) {
  const signal = `READY_${name}`;
  const held = await gatedSession(env, name, firstStatement);
  let b;
  try {
    await marker(held.a, signal);
    assert.equal(held.a.ended(), false, "First transaction closed before second session started");
    b = startSql(env, secondStatement, `${name}_b`);
    const waitEvent = await locked(env, `${name}_b`);
    await held.release();
    const [first, second] = await Promise.all([finished(held.a), finished(b)]);
    return { first, second, waitEvent };
  } finally {
    held.cleanup();
    if (b && !b.ended()) b.child.kill("SIGTERM");
  }
}

function dbTimestamp(time) {
  return new Date(time).toISOString();
}

async function readState(env, creatorId) {
  const query = `with e as (select ranking_pilot.read_projection_evidence() as j)
    select (j->>'projectionRevision') || ':' ||
      (select count(*) from jsonb_array_elements(j->'creators') c
       where c->>'creatorId' =
         (select public_id::text from ranking_pilot.creators where creator_id='${creatorId}'))
    from e`;
  const [revision, visible] = (await sql(env, query)).split(":").map(Number);
  assert.ok(Number.isSafeInteger(revision) && Number.isSafeInteger(visible));
  return { revision, visible };
}

async function main() {
  if (process.argv.length > 3 ||
      (process.argv[2] && process.argv[2] !== "--check-config-only")) {
    throw new Error("Usage: node scripts/ranking-pg-races.mjs [--check-config-only]");
  }
  const { env, database } = targetFromEnvironment();
  if (process.argv[2] === "--check-config-only") {
    process.stdout.write("Configuration guard passed for a loopback disposable database.\n");
    return;
  }
  const binary = spawnSync("psql", ["--version"], { encoding: "utf8" });
  if (binary.error || binary.status !== 0) throw new Error("psql is unavailable; install a local PostgreSQL client/server first");
  if (!process.env.RANKING_PILOT_DATA_DIR || !process.env.RANKING_PILOT_MARKER_NONCE) {
    throw new Error("Run the gate through ranking-local-postgres.mjs with a fresh cluster marker");
  }
  const actualDataDir = await sql(env, "show data_directory");
  if (await realpath(actualDataDir) !== await realpath(process.env.RANKING_PILOT_DATA_DIR)) {
    throw new Error("Connected PostgreSQL cluster does not match the disposable marker");
  }
  const markerContent = await readFile(join(actualDataDir, ".fr-ai-pilot-marker"), "utf8");
  if (markerContent.trim() !== process.env.RANKING_PILOT_MARKER_NONCE) {
    throw new Error("Disposable PostgreSQL marker does not match");
  }
  const actualDatabase = await sql(env, "select current_database()");
  assert.equal(actualDatabase, database, "Connected to a different database");
  assert.equal(await sql(env, "select to_regnamespace('ranking_pilot') is null"), "t",
    "ranking_pilot schema already exists; use a fresh disposable cluster/database");
  assert.equal(await sql(env,
    "select count(*) from pg_roles where rolname like 'ranking_pilot_%'"), "0",
  "Pilot roles already exist; use a fresh disposable cluster");
  assert.equal(await sql(env,
    "select rolcreaterole or rolsuper from pg_roles where rolname=current_user"), "t",
  "The disposable schema owner needs CREATEROLE for pilot role setup");
  const version = await sql(env, "show server_version");
  const ledgerSql = await readFile("contracts/ranking/v1/pilot-ledger.sql", "utf8");
  const boundarySql = await readFile("contracts/ranking/v1/pilot-read-boundary.sql", "utf8");
  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (git.status !== 0) throw new Error("Cannot identify the tested Git commit");
  const evidence = {
    startedAt: new Date().toISOString(),
    invocation: "node scripts/ranking-local-postgres.mjs",
    host: "127.0.0.1",
    database,
    gitCommit: git.stdout.trim(),
    postgresVersion: version,
    ledgerSqlSha256: sha256(ledgerSql),
    boundarySqlSha256: sha256(boundarySql),
    harnessSha256: sha256(await readFile("scripts/ranking-pg-races.mjs")),
    launcherSha256: sha256(await readFile("scripts/ranking-local-postgres.mjs")),
    scenarios: [],
  };
  const dbNow = Date.parse(await sql(env,
    `select to_char(statement_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`));
  assert.ok(Number.isFinite(dbNow), "Invalid database clock");
  const registered = dbTimestamp(dbNow - 3 * 86_400_000);
  const campaign = dbTimestamp(dbNow - 2 * 86_400_000);
  const proof = dbTimestamp(dbNow - 86_400_000);
  const payment = dbTimestamp(dbNow - 82_800_000);
  const recorded = dbTimestamp(dbNow - 82_740_000);

  await sql(env, ledgerSql);
  await sql(env, `insert into ranking_pilot.launch_campaign values ('launch','${campaign}',1000,0)`);
  const addCreator = (id) => sql(env,
    `insert into ranking_pilot.creators(creator_id,registered_at) values ('${id}','${registered}')`);
  const verify = (creator, account) =>
    `select * from ranking_pilot.verify_social('${creator}','${account}','instagram','${account}','${proof}')`;

  await addCreator("race-proof");
  const first = await heldPair(env, "first_proof",
    `select 'A:' || welcome_granted::text || ':' || campaign_granted::text from
      ranking_pilot.verify_social('race-proof','proof-a','instagram','proof-a','${proof}')`,
    `select 'B:' || welcome_granted::text || ':' || campaign_granted::text from
      ranking_pilot.verify_social('race-proof','proof-b','instagram','proof-b','${proof}')`);
  assert.match(first.first, /A:true:true/);
  assert.match(first.second, /B:true:false/);
  const firstCampaignGrants = Number(await sql(env,
    "select count(*) from ranking_pilot.fc_grants where creator_id='race-proof' and grant_kind='campaign_launch'"));
  const firstWelcomeGrants = Number(await sql(env,
    "select count(*) from ranking_pilot.fc_grants where creator_id='race-proof' and grant_kind='welcome'"));
  assert.equal(firstCampaignGrants, 1);
  assert.equal(firstWelcomeGrants, 2);
  const firstVerified = await sql(env,
    `select to_char(first_verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     from ranking_pilot.creators where creator_id='race-proof'`);
  assert.equal(firstVerified, proof);
  evidence.scenarios.push({ name: "first_proof", waitEvent: first.waitEvent,
    sessionA: first.first, sessionB: first.second,
    firstVerified, campaignGrants: firstCampaignGrants, welcomeGrants: firstWelcomeGrants });

  await sql(env, "update ranking_pilot.launch_campaign set admitted_count=999 where campaign_id='launch'");
  await addCreator("race-slot-a");
  await addCreator("race-slot-b");
  const slot = await heldPair(env, "last_slot",
    `select 'A:' || campaign_granted::text from
      ranking_pilot.verify_social('race-slot-a','slot-a','instagram','slot-a','${proof}')`,
    `select 'B:' || campaign_granted::text from
      ranking_pilot.verify_social('race-slot-b','slot-b','instagram','slot-b','${proof}')`);
  assert.match(slot.first, /A:true/);
  assert.match(slot.second, /B:false/);
  const admitted = Number(await sql(env, "select admitted_count from ranking_pilot.launch_campaign"));
  const lastCampaignGrants = Number(await sql(env,
    "select count(*) from ranking_pilot.fc_grants where creator_id in ('race-slot-a','race-slot-b') and grant_kind='campaign_launch'"));
  assert.equal(admitted, 1000);
  assert.equal(lastCampaignGrants, 1);
  evidence.scenarios.push({ name: "last_slot", waitEvent: slot.waitEvent,
    sessionA: slot.first, sessionB: slot.second,
    admittedCount: admitted, campaignGrants: lastCampaignGrants });

  await addCreator("race-payment");
  const paySql = `ranking_pilot.record_cash('dodo:race-payment','race-payment',500,
    '${payment}','${recorded}',false)`;
  const pay = await heldPair(env, "same_payment",
    `select 'A:' || ${paySql}::text`, `select 'B:' || ${paySql}::text`);
  assert.match(pay.first, /A:true/);
  assert.match(pay.second, /B:false/);
  const paymentRows = Number(await sql(env,
    "select count(*) from ranking_pilot.cash_payments where source_key='dodo:race-payment'"));
  const paymentGross = Number(await sql(env,
    "select sum(gross_usd_minor) from ranking_pilot.cash_payments where source_key='dodo:race-payment'"));
  assert.equal(paymentRows, 1);
  assert.equal(paymentGross, 500);
  const conflict = startSql(env, `select ranking_pilot.record_cash('dodo:race-payment',
    'race-payment',600,'${payment}','${recorded}',false)`);
  const conflictResult = await conflict.done;
  assert.notEqual(conflictResult.code, 0);
  assert.match(conflictResult.stderr, /Conflicting replay for cash source key/);
  assert.equal(Number(await sql(env,
    "select count(*) from ranking_pilot.cash_payments where source_key='dodo:race-payment'")), 1);
  evidence.scenarios.push({ name: "same_payment", waitEvent: pay.waitEvent,
    sessionA: pay.first, sessionB: pay.second, paymentRows, paymentGross,
    conflictingReplayRejected: true });

  // The ledger races above must run before the global revision clock exists;
  // otherwise that clock could be the only lock the second writer waits on.
  await sql(env, boundarySql);

  await addCreator("revision-a");
  await addCreator("revision-b");
  const revisionBefore = Number(await sql(env,
    "select revision from ranking_pilot.projection_clock"));
  const revisionRace = await heldPair(env, "revision_clock",
    "select ranking_pilot.set_publication_consent('revision-a',true)",
    "select ranking_pilot.set_publication_consent('revision-b',true)");
  assert.match(revisionRace.first, /\bt\b/);
  assert.match(revisionRace.second, /\bt\b/);
  const revisionAfter = Number(await sql(env,
    "select revision from ranking_pilot.projection_clock"));
  assert.equal(revisionAfter, revisionBefore + 2);
  const revisionRows = await sql(env,
    `select string_agg(revision::text, ',' order by revision) from ranking_pilot.projection_outbox
     where revision > ${revisionBefore}`);
  assert.equal(revisionRows, `${revisionBefore + 1},${revisionBefore + 2}`);
  evidence.scenarios.push({ name: "revision_clock", waitEvent: revisionRace.waitEvent,
    sessionA: revisionRace.first, sessionB: revisionRace.second,
    revisionBefore, revisionAfter, outboxRevisions: revisionRows });

  for (const [name, mutation] of [
    ["proof", "select ranking_pilot.revoke_social('vis-proof','vis-proof-account')"],
    ["consent", "select ranking_pilot.set_publication_consent('vis-consent',false)"],
    ["moderation", "select ranking_pilot.set_moderation_allowed('vis-moderation',false)"],
    ["erasure", "select ranking_pilot.mark_erasure_hidden('vis-erasure')"],
  ]) {
    const id = `vis-${name}`;
    await addCreator(id);
    await sql(env, verify(id, `${id}-account`));
    await sql(env, `select ranking_pilot.set_publication_consent('${id}',true)`);
    const before = await readState(env, id);
    assert.equal(before.visible, 1);
    const held = await gatedSession(env, `hide_${name}`, mutation);
    let during;
    try {
      await marker(held.a, `READY_hide_${name}`);
      during = await readState(env, id);
      assert.deepEqual(during, before,
        "An uncommitted hide must not change a fresh reader's snapshot");
      await held.release();
      await finished(held.a);
    } finally {
      held.cleanup();
    }
    const after = await readState(env, id);
    assert.equal(after.visible, 0);
    assert.ok(after.revision > before.revision);
    evidence.scenarios.push({ name: `hide_${name}`, before, during, after });
  }

  await addCreator("vis-rollback");
  await sql(env, verify("vis-rollback", "vis-rollback-account"));
  await sql(env, "select ranking_pilot.set_publication_consent('vis-rollback',true)");
  const beforeRollback = await readState(env, "vis-rollback");
  const rollback = await gatedSession(env, "rollback",
    "select ranking_pilot.set_publication_consent('vis-rollback',false)", "rollback");
  try {
    await marker(rollback.a, "READY_rollback");
    assert.deepEqual(await readState(env, "vis-rollback"), beforeRollback);
    await rollback.release();
    await finished(rollback.a);
  } finally {
    rollback.cleanup();
  }
  assert.deepEqual(await readState(env, "vis-rollback"), beforeRollback);
  evidence.scenarios.push({ name: "rollback", before: beforeRollback,
    after: await readState(env, "vis-rollback") });

  const roleSuffix = randomBytes(4).toString("hex");
  const rolePassword = randomBytes(24).toString("hex");
  const roleChecks = [];
  let readerEnv;
  for (const [label, role, allowed] of [
    ["reader", "ranking_pilot_reader",
      "select (ranking_pilot.read_projection_evidence()->>'projectionRevision')::bigint > 0"],
    ["payment", "ranking_pilot_payment_writer",
      `select ranking_pilot.record_cash('dodo:role','race-payment',500,'${payment}','${recorded}',false)`],
    ["consent", "ranking_pilot_consent_writer",
      "select ranking_pilot.set_publication_consent('revision-a',false)"],
  ]) {
    const login = `fr_ai_${label}_${roleSuffix}`;
    await sql(env, `create role ${login} login password '${rolePassword}';
      grant ${role} to ${login}`);
    const roleEnv = { ...env, PGUSER: login, PGPASSWORD: rolePassword };
    if (label === "reader") readerEnv = roleEnv;
    assert.equal(await sql(roleEnv, allowed), "t", `${role} could not perform its permitted action`);
    const directTable = await startSql(roleEnv,
      "select count(*) from ranking_pilot.creators").done;
    assert.notEqual(directTable.code, 0, `${role} could read a base table`);
    assert.match(directTable.stderr, /permission denied/);
    const crossFunction = await startSql(roleEnv,
      label === "reader"
        ? "select ranking_pilot.set_publication_consent('revision-a',true)"
        : "select ranking_pilot.read_projection_evidence()").done;
    assert.notEqual(crossFunction.code, 0, `${role} could call another role's function`);
    assert.match(crossFunction.stderr, /permission denied/);
    roleChecks.push({ role, permitted: true, directTableDenied: true,
      crossFunctionDenied: true });
  }
  evidence.scenarios.push({ name: "least_privilege_login_roles", checks: roleChecks });

  for (const [index, id] of ["adapter-a", "adapter-b"].entries()) {
    await addCreator(id);
    await sql(env,
      `select * from ranking_pilot.verify_social('${id}','${id}-account',
       'instagram','${id}-account','${dbTimestamp(Date.parse(proof) + (index + 1) * 1000)}')`);
    await sql(env, `select ranking_pilot.set_publication_consent('${id}',true)`);
  }
  const publicA = await sql(env,
    "select public_id::text from ranking_pilot.creators where creator_id='adapter-a'");
  const publicB = await sql(env,
    "select public_id::text from ranking_pilot.creators where creator_id='adapter-b'");
  await mkdir("work", { recursive: true });
  const adapterPath = resolve("work/pilot-read-v1-pg.mjs");
  await build({ entryPoints: ["lib/core/ranking/pilot-read-v1.ts"],
    outfile: adapterPath, bundle: true, platform: "node", format: "esm",
    packages: "external" });
  const { readGlobalPage, readPublicCreator, quoteCurrent, revalidateQuote } =
    await import(pathToFileURL(adapterPath).href);
  const reader = { query: async (query) => {
    assert.equal(query, "select ranking_pilot.read_projection_evidence() as evidence");
    return { rows: [{ evidence: JSON.parse(await sql(readerEnv,
      "select ranking_pilot.read_projection_evidence()::text")) }] };
  } };
  const firstPage = await readGlobalPage(reader, { period: "all_time", pageSize: 1 });
  assert.equal(firstPage.status, "OK");
  assert.ok(firstPage.nextCursor);
  const quote = await quoteCurrent(reader, publicA, publicB);
  assert.deepEqual(await revalidateQuote(reader, quote), { status: "CURRENT" });
  const transportPath = resolve("work/public-api-v1-pg.mjs");
  await build({ entryPoints: ["lib/core/ranking/public-api-v1.ts"],
    outfile: transportPath, bundle: true, platform: "node", format: "esm",
    packages: "external" });
  const { handleLeaderboardRead, handleCreatorRead } =
    await import(pathToFileURL(transportPath).href);
  const transportDeps = { reader, cursorKey: "isolated-postgres-synthetic-cursor-key-32-bytes",
    rateLimit: async () => true };
  const boardUrl = "http://localhost/api/v1/leaderboards?scope=global&period=all_time&limit=1";
  const transportPage = await handleLeaderboardRead(new Request(boardUrl), transportDeps);
  assert.equal(transportPage.status, 200);
  assert.equal(transportPage.headers.get("Cache-Control"), "no-store");
  const transportBody = await transportPage.json();
  assert.ok(transportBody.next_cursor);
  assert.equal(typeof transportBody.rows[0].combined_score_micro, "string");
  const publicProfile = await handleCreatorRead(new Request(`http://localhost/api/v1/creators/${publicA}`),
    publicA, transportDeps);
  assert.equal(publicProfile.status, 200);
  const adapterRevisionBefore = Number(await sql(env,
    "select revision from ranking_pilot.projection_clock"));
  await sql(env, "select ranking_pilot.revoke_social('adapter-a','adapter-a-account')");
  assert.equal(Number(await sql(env,
    "select revision from ranking_pilot.projection_clock")), adapterRevisionBefore + 1);
  assert.deepEqual(await readGlobalPage(reader,
    { period: "all_time", pageSize: 1, cursor: firstPage.nextCursor }),
  { status: "STALE_CURSOR" });
  assert.deepEqual(await readPublicCreator(reader, publicA), { status: "NOT_PUBLIC" });
  assert.deepEqual(await revalidateQuote(reader, quote), { status: "STALE_QUOTE" });
  const transportStale = await handleLeaderboardRead(
    new Request(`${boardUrl}&cursor=${transportBody.next_cursor}`), transportDeps);
  assert.equal(transportStale.status, 410);
  const transportHidden = await handleCreatorRead(new Request(`http://localhost/api/v1/creators/${publicA}`),
    publicA, transportDeps);
  assert.equal(transportHidden.status, 404);
  evidence.scenarios.push({ name: "real_postgres_adapter", readerRole: "ranking_pilot_reader",
    priorRevision: adapterRevisionBefore, afterRevision: adapterRevisionBefore + 1,
    staleCursor: true, hiddenProfile: true, staleQuote: true,
    httpTransport: { initialPage: transportPage.status, noStore: true,
      exactScoreString: true, initialProfile: publicProfile.status,
      staleCursor: transportStale.status, hiddenProfile: transportHidden.status } });

  const rejectedIsolation = startSql(env,
    "begin transaction isolation level repeatable read read only; select ranking_pilot.read_projection_evidence();");
  const rejected = await rejectedIsolation.done;
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /fresh READ COMMITTED statement/);
  const finalRevision = Number(await sql(env,
    "select revision from ranking_pilot.projection_clock"));
  const outboxRows = Number(await sql(env,
    "select count(*) from ranking_pilot.projection_outbox"));
  assert.equal(finalRevision - 1, outboxRows);
  evidence.scenarios.push({ name: "isolation_and_outbox", repeatableReadRejected: true,
    finalRevision, outboxRows });
  evidence.finishedAt = new Date().toISOString();
  if (process.env.RANKING_PILOT_EVIDENCE_PATH) {
    const root = resolve(process.cwd(), "../..");
    const path = resolve(process.env.RANKING_PILOT_EVIDENCE_PATH);
    if (!path.startsWith(`${root}${sep}`)) {
      throw new Error("Evidence path must remain inside the task workspace");
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  }

  process.stdout.write(`PASS: real PostgreSQL ${version}, ${database}; four lock races, four visibility races, rollback, role and adapter checks, revision/outbox and isolation guard.\n`);
}

main().catch((error) => {
  process.stderr.write(`FR-AI-04A PostgreSQL gate: ${error.message}\n`);
  process.exitCode = 2;
});
