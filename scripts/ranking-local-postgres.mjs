// Launches a fresh, password-protected PostgreSQL cluster in the OS temp
// directory, runs FR-AI-04A two-session races, then stops and removes it.
// Never touches Homebrew's default cluster or a production connection.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";

const pgBin = "/opt/homebrew/opt/postgresql@17/bin";

function command(binary, args, env, timeout = 30_000) {
  const result = spawnSync(join(pgBin, binary), args, {
    env, encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${binary} failed: ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`);
  }
  return result.stdout.trim();
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error("Usage: node scripts/ranking-local-postgres.mjs");
  }
  const base = await mkdtemp(join(tmpdir(), "fr-ai-pg-"));
  const data = join(base, "data");
  const passwordFile = join(base, "initdb-password");
  const markerFile = join(data, ".fr-ai-pilot-marker");
  const log = join(base, "postgres.log");
  const password = randomBytes(24).toString("hex");
  const markerNonce = randomBytes(32).toString("hex");
  const user = userInfo().username;
  const database = `fr_ai_pilot_${randomBytes(4).toString("hex")}`;
  const evidencePath = resolve(process.cwd(), "../..", "outputs", "agent-loop",
    `${database}-race-evidence.json`);
  let startupAttempted = false;
  let canRemove = true;
  try {
    await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
    const env = { ...process.env, PATH: `${pgBin}:${process.env.PATH ?? ""}`,
      LC_ALL: "C", PGCONNECT_TIMEOUT: "5" };
    command("initdb", ["-D", data, "--encoding=UTF8", "--locale=C",
      "--auth-local=scram-sha-256", "--auth-host=scram-sha-256",
      `--username=${user}`, `--pwfile=${passwordFile}`, "--no-instructions"], env);
    await rm(passwordFile);
    await writeFile(markerFile, `${markerNonce}\n`, { mode: 0o600, flag: "wx" });
    const port = await freePort();
    startupAttempted = true;
    command("pg_ctl", ["-D", data, "-l", log, "-w", "-t", "20", "-o",
      `-c listen_addresses=127.0.0.1 -c port=${port} -c unix_socket_directories=${base}`,
      "start"], env);
    const clientEnv = { ...env, PGHOST: "127.0.0.1", PGPORT: String(port),
      PGUSER: user, PGPASSWORD: password, PGDATABASE: "postgres" };
    command("createdb", [database], clientEnv);
    const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
      `@127.0.0.1:${port}/${database}`;
    const result = spawnSync(process.execPath, ["scripts/ranking-pg-races.mjs"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...clientEnv, RANKING_PILOT_TEST_URL: url,
        RANKING_PILOT_DISPOSABLE: "YES",
        RANKING_PILOT_DATA_DIR: data,
        RANKING_PILOT_MARKER_NONCE: markerNonce,
        RANKING_PILOT_EVIDENCE_PATH: evidencePath },
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Race gate failed: ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`);
    }
    process.stdout.write(result.stdout);
    process.stdout.write(`Evidence: ${evidencePath}\n`);
  } finally {
    if (startupAttempted) {
      try {
        const stopEnv = { ...process.env, PATH: `${pgBin}:${process.env.PATH ?? ""}` };
        const status = spawnSync(join(pgBin, "pg_ctl"), ["-D", data, "status"],
          { env: stopEnv, encoding: "utf8", timeout: 10_000 });
        if (status.error || (status.status !== 0 && status.status !== 3)) {
          throw new Error(`Cannot determine server status: ${status.stderr || status.error?.message || status.status}`);
        }
        if (status.status === 0) {
          command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "-t", "20", "stop"],
            stopEnv, 30_000);
        }
      } catch (error) {
        canRemove = false;
        process.stderr.write(`Temporary PostgreSQL could not be stopped; retained at ${base}: ${error.message}\n`);
      }
    }
    if (canRemove) await rm(base, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`FR-AI-04A local PostgreSQL: ${error.message}\n`);
  process.exitCode = 2;
});
