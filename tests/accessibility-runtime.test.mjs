import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { JSDOM } from "jsdom";
import axe from "axe-core";

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
      await fetch(url);
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Astro no respondió a tiempo: ${String(lastError)}\n${serverOutput}`,
  );
}

async function fetchHtml(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.status, 200, `${pathname} debe responder 200`);
  return response.text();
}

describe("Accesibilidad en HTML renderizado", () => {
  before(async () => {
    const port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(
      process.platform === "win32" ? "node_modules/.bin/astro.cmd" : "node_modules/.bin/astro",
      ["dev", "--host", "127.0.0.1", "--port", String(port), "--no-open"],
      {
        cwd: root,
        env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
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

  it("no presenta violaciones axe críticas o serias en páginas públicas y login", async () => {
    const routes = ["/privacidad/", "/terminos/", "/admin/index.html", "/admin/panel.html"];
    const dom = new JSDOM("", {
      url: baseUrl,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    dom.window.eval(axe.source);

    const findings = [];
    try {
      for (const route of routes) {
        const html = await fetchHtml(route);
        dom.window.document.open();
        dom.window.document.write(html);
        dom.window.document.close();

        const results = await dom.window.axe.run(dom.window.document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        });
        const serious = results.violations.filter(
          (violation) =>
            violation.impact === "critical" || violation.impact === "serious",
        );
        for (const violation of serious) {
          const targets = violation.nodes
            .map((node) => node.target.join(", "))
            .slice(0, 3)
            .join(", ");
          findings.push(
            `${route}: ${violation.id} (${violation.impact}) — ${targets}`,
          );
        }
      }
    } finally {
      dom.window.close();
    }

    assert.deepEqual(
      findings,
      [],
      `Violaciones axe críticas/serias:\n${findings.join("\n")}`,
    );
  });

  it("mantiene el orden natural de tabulación en páginas públicas y login", async () => {
    const routes = ["/privacidad/", "/terminos/", "/admin/index.html", "/admin/panel.html"];
    const dom = new JSDOM("", { url: baseUrl });

    try {
      for (const route of routes) {
        const html = await fetchHtml(route);
        const parsed = new JSDOM(html, { url: `${baseUrl}${route}` });
        const focusable = parsed.window.document.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]',
        );

        for (const element of focusable) {
          assert.ok(
            element.tabIndex <= 0,
            `${route}: ${element.tagName.toLowerCase()} usa tabindex positivo (${element.tabIndex})`,
          );
        }
        parsed.window.close();
      }
    } finally {
      dom.window.close();
    }
  });
});
