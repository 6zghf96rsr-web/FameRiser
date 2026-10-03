import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = "scripts/ranking-pg-races.mjs";
function config(url, disposable = "YES") {
  return spawnSync(process.execPath, [script, "--check-config-only"], {
    cwd: process.cwd(),
    env: { ...process.env, RANKING_PILOT_TEST_URL: url, RANKING_PILOT_DISPOSABLE: disposable },
    encoding: "utf8",
  });
}

test("PostgreSQL race gate refuses non-disposable and production targets before connecting", () => {
  const safe = "postgres://pilot:synthetic@127.0.0.1:5432/fr_ai_pilot_gate";
  const missingMarker = config(safe, "NO");
  assert.equal(missingMarker.status, 2);
  assert.match(missingMarker.stderr, /RANKING_PILOT_DISPOSABLE=YES/);

  const productionName = config("postgres://pilot:synthetic@127.0.0.1/production");
  assert.equal(productionName.status, 2);
  assert.match(productionName.stderr, /fr_ai_pilot_/);

  const remote = config("postgres://pilot:synthetic@db.example.test/fr_ai_pilot_gate");
  assert.equal(remote.status, 2);
  assert.match(remote.stderr, /loopback/);

  const ambiguousLocalhost = config("postgres://pilot:synthetic@localhost/fr_ai_pilot_gate");
  assert.equal(ambiguousLocalhost.status, 2);
  assert.match(ambiguousLocalhost.stderr, /loopback/);

  const guarded = config(safe);
  assert.equal(guarded.status, 0);
  assert.match(guarded.stdout, /Configuration guard passed/);
  assert.equal(guarded.stdout.includes("synthetic"), false);
  assert.equal(guarded.stderr, "");
});
