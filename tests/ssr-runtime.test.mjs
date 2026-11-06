import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const root = process.cwd();
let serverProcess;
let baseUrl;
let serverOutput = "";

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { port } = address;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Astro terminó antes de iniciar.\n${serverOutput}`);
    }
    try {
      const response = await fetch(url);
      if (response.status > 0) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Astro no respondió a tiempo: ${String(lastError)}\n${serverOutput}`,
  );
}

describe("SSR runtime", () => {
  before(async () => {
    const port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(
      process.execPath,
      ["node_modules/astro/astro.js", "dev", "--host", "127.0.0.1", "--port", String(port), "--no-open"],
      {
        cwd: root,
        env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    serverProcess.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    serverProcess.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    await waitForServer(`${baseUrl}/privacidad/`);
  }, { timeout: 30_000 });

  after(() => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
    }
  });

  for (const route of [
    { path: "/privacidad/", heading: "Política de privacidad" },
    { path: "/terminos/", heading: "Términos y condiciones" },
  ]) {
    it(`renderiza ${route.path} mediante SSR con estructura base accesible`, async () => {
      const response = await fetch(`${baseUrl}${route.path}`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /<html[^>]+lang="es"/i);
      assert.match(html, /<title>[^<]+\| Netti<\/title>/i);
      assert.match(html, /href="#main-content"/i);
      assert.match(html, /<main[^>]+id="main-content"/i);
      assert.match(html, new RegExp(`<h1[^>]*>\\s*${route.heading}`, "i"));
      assert.doesNotMatch(html, /Internal Server Error|Cannot find module/i);
    });
  }
});
