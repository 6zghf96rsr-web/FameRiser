import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("work", { recursive: true });
await build({
  entryPoints: ["tests/business.test.ts", "tests/instagram.test.ts", "tests/demo-accounts.test.ts", "tests/notices.test.ts", "tests/commerce.test.ts", "tests/connection-options.test.ts", "tests/scaling.test.ts"],
  outdir: "work",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const result = spawnSync(
  process.execPath,
  ["--test", "work/business.test.mjs", "work/instagram.test.mjs", "work/demo-accounts.test.mjs", "work/notices.test.mjs", "work/commerce.test.mjs", "work/connection-options.test.mjs", "work/scaling.test.mjs", "tests/database.test.mjs", "tests/configure-auth.test.mjs", "tests/cookie-consent.test.mjs", "tests/auth-session.test.mjs", "tests/facebook-pages.test.mjs", "tests/review-routes.test.mjs", "tests/podium-resize.test.mjs"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
