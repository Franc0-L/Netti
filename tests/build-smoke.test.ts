import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("Build smoke", () => {
  it("astro config usa output: server y adapter vercel", () => {
    const config = readFileSync(join(root, "astro.config.mjs"), "utf8");
    expect(config).toMatch(/output:\s*"server"/);
    expect(config).toMatch(/adapter:\s*vercel/);
  });

  it("vercel.json aplica cabeceras de seguridad", () => {
    const vercelJson = JSON.parse(
      readFileSync(join(root, "vercel.json"), "utf8"),
    );
    expect(Array.isArray(vercelJson.headers)).toBe(true);

    const globalHeaders = vercelJson.headers.find(
      (h: any) => h.source === "/(.*)",
    );
    expect(globalHeaders).toBeDefined();
    const globalKeys = globalHeaders.headers.map((h: any) => h.key.toLowerCase());
    expect(globalKeys).toContain("x-content-type-options");
    expect(globalKeys).toContain("referrer-policy");
    expect(globalKeys).toContain("permissions-policy");

    const adminHeaders = vercelJson.headers.find(
      (h: any) => h.source === "/admin/(.*)",
    );
    expect(adminHeaders).toBeDefined();
    const adminKeys = adminHeaders.headers.map((h: any) => h.key.toLowerCase());
    expect(adminKeys).toContain("x-frame-options");
    expect(adminKeys).toContain("content-security-policy");
  });

  it("package.json incluye dependencias de SSR y Vercel", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.dependencies?.["@astrojs/vercel"]).toBeDefined();
    expect(pkg.dependencies?.astro).toBeDefined();
    expect(pkg.dependencies?.marked).toBeDefined();
    expect(pkg.dependencies?.zod).toBeDefined();
  });

  it("páginas de detalle [slug] usan Astro.rewrite('/404')", () => {
    const slugPages = [
      "juegos/[slug].astro",
      "resenas/[slug].astro",
      "noticias/[slug].astro",
      "guias/[slug].astro",
    ];
    for (const file of slugPages) {
      const source = readFileSync(
        join(root, "src", "pages", ...file.split("/")),
        "utf8",
      );
      expect(source).toMatch(/Astro\.rewrite\("\/404"\)/);
      expect(source).not.toMatch(/status:\s*404/);
    }
  });
});
