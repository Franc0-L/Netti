import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";

// npm no está disponible en todos los entornos (p. ej. Windows local sin npm en PATH).
// En GitHub Actions sí está disponible tras `npm ci`.
let npmAvailable = false;
try {
  execSync("npm --version", { stdio: "pipe", timeout: 5000 });
  npmAvailable = true;
} catch {
  npmAvailable = false;
}

const describeOrSkip = npmAvailable ? describe : describe.skip;

describeOrSkip("Rendimiento (build)", () => {
  it(
    "astro build debe completarse en menos de 60 segundos",
    () => {
      const start = performance.now();
      try {
        execSync("npm run build", {
          stdio: "pipe",
          timeout: 60000,
          cwd: process.cwd(),
        });
      } catch (error) {
        throw new Error(`astro build falló: ${error}`);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(60000);
    },
    90000,
  );

  it("el directorio dist debe existir después del build", () => {
    const distDir = join(process.cwd(), "dist");
    expect(() => statSync(distDir)).not.toThrow();
  });
});
