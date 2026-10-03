import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const testSource = readFileSync(new URL("../tests/database.test.mjs", import.meta.url), "utf8");
const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const errors = [];
for (const [index, name] of files.entries()) {
  const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
  if (!match) errors.push(`Invalid migration filename: ${name}`);
  else if (Number(match[1]) !== index + 1) errors.push(`Missing or duplicate migration number before ${name}`);
  if (!testSource.includes(name)) errors.push(`Migration is absent from PGlite tests: ${name}`);
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Migration coverage passed: ${files.length} numbered SQL migrations referenced by database tests.`);
}
