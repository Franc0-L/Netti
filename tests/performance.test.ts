import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";

const NODE_EXE =
  "C:\\Users\\Franco\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe";
const ASTRO_CLI = join(
  process.cwd(),
  "node_modules",
  "astro",
  "dist",
  "cli",
  "index.js",
);

describe("Rendimiento (build)", () => {
  it("astro build debe completarse en menos de 60 segundos", () => {
    const start = performance.now();
    try {
      execSync(`"${NODE_EXE}" "${ASTRO_CLI}" build`, {
        stdio: "pipe",
        timeout: 60000,
        cwd: process.cwd(),
      });
    } catch (error) {
      throw new Error(`astro build falló: ${error}`);
    }
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(60000);
  });

  it("el directorio dist debe existir después del build", () => {
    const distDir = join(process.cwd(), "dist");
    expect(() => statSync(distDir)).not.toThrow();
  });
});
