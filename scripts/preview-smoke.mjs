import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = 8765;
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, [
  "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
  "dev", "--config", "dist/server/wrangler.json", "--local",
  "--persist-to", ".wrangler/state", "--ip", "127.0.0.1",
  "--inspector-port", "0", "--port", String(port),
], {
  cwd: root,
  env: {
    ...process.env,
    RANKME_DEMO: "true",
    PAYMENTS_ENABLED: "false",
    APP_URL: url.slice(0, -1),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let exited = false;
server.on("exit", () => { exited = true; });
server.on("error", (error) => { output += `\n${error.message}`; exited = true; });
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-6000);
  });
}

try {
  let lastError = "Preview did not become ready";
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      const html = await response.text();
      if (response.ok && response.headers.get("content-type")?.includes("text/html") && html.includes("FameRiser")) {
        console.log(`Preview smoke passed: GET / returned ${response.status} HTML with FameRiser content.`);
        process.exitCode = 0;
        break;
      }
      lastError = `Unexpected response: ${response.status} ${response.headers.get("content-type")}`;
    } catch (error) {
      lastError = error.message;
    }
    await delay(400);
  }
  if (process.exitCode !== 0) {
    console.error(`Preview smoke failed: ${lastError}\n${output}`);
    process.exitCode = 1;
  }
} finally {
  if (!exited) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(3000)]);
    if (!exited) server.kill("SIGKILL");
  }
}
