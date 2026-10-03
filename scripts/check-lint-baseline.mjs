import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const baselinePath = path.join(root, "quality/lint-baseline.json");
const update = process.argv.length === 3 && process.argv[2] === "--update";
if (process.argv.length > (update ? 3 : 2)) {
  throw new Error("Usage: node scripts/check-lint-baseline.mjs [--update]");
}

const eslint = spawnSync(process.execPath, [
  path.join(root, "node_modules/eslint/bin/eslint.js"),
  ".", "--format", "json", "--ignore-pattern", "dist", "--ignore-pattern", ".next", "--ignore-pattern", "work",
], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (eslint.error) throw eslint.error;
if (![0, 1].includes(eslint.status)) {
  throw new Error(`ESLint failed (exit ${eslint.status}): ${eslint.stderr}`);
}

const results = JSON.parse(eslint.stdout);
const findings = new Map();
// Some rules embed an absolute checkout path in their diagnostic text. Keep
// baseline identities stable when the same commit is checked in a worktree.
function normalizeMessage(message, file) {
  const anchor = `/${file}:`;
  return message.split("\n").map((line) => {
    const index = line.indexOf(anchor);
    return line.startsWith("/") && index >= 0
      ? `<checkout>${line.slice(index)}`
      : line;
  }).join("\n");
}

for (const result of results) {
  const file = path.relative(root, result.filePath).replaceAll(path.sep, "/");
  if (file.startsWith("../") || path.isAbsolute(file)) {
    throw new Error(`ESLint reported a file outside the checkout: ${file}`);
  }
  if (!result.messages.length) continue;
  const lines = readFileSync(result.filePath, "utf8").split(/\r?\n/);
  for (const finding of result.messages) {
    const line = lines[(finding.line ?? 1) - 1]?.trim() ?? "";
    const sourceHash = createHash("sha256").update(line).digest("hex");
    const key = JSON.stringify([file, finding.severity, finding.ruleId, normalizeMessage(finding.message, file), sourceHash]);
    findings.set(key, (findings.get(key) ?? 0) + 1);
  }
}
const current = Object.fromEntries([...findings].sort(([a], [b]) => a.localeCompare(b)));
const count = (items) => Object.values(items).reduce((sum, n) => sum + n, 0);

if (update) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Recorded ${count(current)} existing lint findings in ${path.relative(root, baselinePath)}.`);
  process.exit(0);
}

const rawBaseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baseline = {};
for (const [key, n] of Object.entries(rawBaseline)) {
  const [file, severity, rule, message, sourceHash] = JSON.parse(key);
  const normalized = JSON.stringify([file, severity, rule, normalizeMessage(message, file), sourceHash]);
  baseline[normalized] = (baseline[normalized] ?? 0) + n;
}
const added = Object.entries(current).filter(([key, n]) => n > (baseline[key] ?? 0));
if (added.length) {
  console.error(`${added.reduce((sum, [key, n]) => sum + n - (baseline[key] ?? 0), 0)} new lint findings:`);
  for (const [key, n] of added) {
    const [file, severity, rule, message] = JSON.parse(key);
    console.error(`${file}: ${severity === 2 ? "error" : "warning"} ${rule}: ${message} (+${n - (baseline[key] ?? 0)})`);
  }
  process.exitCode = 1;
} else {
  console.log(`Lint baseline passed: ${count(current)} current findings; no new errors or warnings.`);
}
