import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Markdown sanitización", () => {
  const root = process.cwd();
  const configPath = join(root, "astro.config.mjs");

  it("astro.config.mjs importa rehype-sanitize", () => {
    const source = readFileSync(configPath, "utf8");
    expect(source).toContain("rehype-sanitize");
    expect(source).toContain("rehypeRaw");
  });

  it("astro.config.mjs define markdownSanitizeSchema", () => {
    const source = readFileSync(configPath, "utf8");
    expect(source).toContain("markdownSanitizeSchema");
    expect(source).toContain("defaultSchema");
  });

  it("src/lib/markdown.ts existe y usa marked", () => {
    const source = readFileSync(
      join(root, "src", "lib", "markdown.ts"),
      "utf8",
    );
    expect(source).toContain("marked");
    expect(source).toContain("resolveImageUrl");
  });

  it("src/lib/markdown.ts reescribe rutas de imagen", () => {
    const source = readFileSync(
      join(root, "src", "lib", "markdown.ts"),
      "utf8",
    );
    expect(source).toContain("src|poster");
    expect(source).toContain("resolveImageUrl(url)");
  });
});
