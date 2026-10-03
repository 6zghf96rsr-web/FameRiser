import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Exercise the actual configuration command without making external changes.
function run(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fameriser-auth-"));
  const preload = join(dir, "management-api.mjs");
  writeFileSync(preload, `
    import assert from "node:assert/strict";
    let saved = { uri_allow_list: "https://existing.example/auth/callback", external_apple_enabled: true };
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth");
      assert.equal(options.redirect, "error");
      if (options.method === "PATCH") {
        const patch = JSON.parse(options.body);
        assert.equal(patch.external_facebook_enabled, true);
        assert.equal(patch.external_facebook_client_id, "test-app-id");
        assert.equal(patch.external_facebook_secret, "test-app-secret");
        assert.equal(patch.external_apple_enabled, undefined);
        assert.equal(patch.external_google_enabled, undefined);
        assert.equal(patch.security_manual_linking_enabled, true);
        assert(patch.uri_allow_list.includes("https://existing.example/auth/callback"));
        assert(patch.uri_allow_list.includes("https://fameriser.com/auth/callback?**"));
        assert(!patch.uri_allow_list.includes("https://fameriser.com/**"));
        saved = { ...saved, ...patch };
        if (process.env.TEST_DROP_REDIRECT === "1") saved.uri_allow_list = "";
      }
      return Response.json(saved);
    };
  `);
  try {
    return spawnSync(process.execPath, ["--import", preload, fileURLToPath(new URL("../scripts/configure-auth.mjs", import.meta.url)), "--apply"], {
      cwd: dir, encoding: "utf8", env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-key",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
        SUPABASE_ACCESS_TOKEN: "test-management-token",
        ANALYTICS_SECRET: "test-analytics-secret",
        APP_URL: "https://fameriser.com",
        FACEBOOK_APP_ID: "test-app-id",
        FACEBOOK_APP_SECRET: "test-app-secret",
        PAYMENTS_ENABLED: "false",
        ...extra,
      },
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("Facebook can be enabled alone while preserving existing providers and redirects", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  for (const secret of ["test-app-secret", "test-service-key", "test-management-token"])
    assert(!(result.stdout + result.stderr).includes(secret));
});

test("configuration does not report success when callback settings were not retained", () => {
  const result = run({ TEST_DROP_REDIRECT: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nepotvrdil/);
});

test("configuration refuses insecure production origins and partial provider credentials", () => {
  assert.equal(run({ APP_URL: "http://fameriser.com" }).status, 1);
  assert.equal(run({ FACEBOOK_APP_SECRET: "" }).status, 1);
});
