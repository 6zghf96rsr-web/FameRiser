import "./sites-env.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";

// The placeholder ID and --local are intentional. This command cannot migrate
// a hosted database and never modifies the provider-owned hosting configuration.
const hosting = JSON.parse(await readFile(path.join(projectRoot, ".openai/hosting.json"), "utf8"));
if (hosting.d1 !== "DB") throw new Error("This demo requires the DB binding.");
const runtime = path.join(projectRoot, ".sites-runtime");
await mkdir(runtime, { recursive: true });
const config = path.join(runtime, "demo-d1.json");
await writeFile(config, JSON.stringify({
  name: "rankme-demo-local",
  compatibility_date: "2026-05-15",
  d1_databases: [{ binding: "DB", database_name: "site-creator-d1",
    database_id: "00000000-0000-4000-8000-000000000000",
    migrations_dir: path.join(projectRoot, "drizzle") }],
}, null, 2));
const result = spawnSync(process.execPath, [
  path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
  "d1", "migrations", "apply", "DB", "--local", "--config", config,
  "--persist-to", path.join(projectRoot, ".wrangler/state"),
], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
process.exit(result.status ?? 1);
