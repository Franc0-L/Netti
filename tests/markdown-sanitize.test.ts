import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "../src/lib/markdown";

describe("Markdown sanitización", () => {
  const root = process.cwd();

  it("comparte el esquema de sanitización con astro.config.mjs", () => {
    const config = readFileSync(join(root, "astro.config.mjs"), "utf8");
    const markdown = readFileSync(
      join(root, "src", "lib", "markdown.ts"),
      "utf8",
    );
    const schema = readFileSync(
      join(root, "src", "lib", "markdown-schema.ts"),
      "utf8",
    );

    expect(config).toContain("markdownSanitizeSchema");
    expect(config).toContain("rehype-sanitize");
    expect(config).toContain("rehype-raw");
    expect(markdown).toContain("markdownSanitizeSchema");
    expect(markdown).toContain("rehypeSanitize");
    expect(schema).toContain("defaultSchema");
    expect(schema).toContain("markdownSanitizeSchema");
  });

  it("reescribe rutas locales de imagen", () => {
    const html = renderMarkdown(
      '<img src="/images/editorial/news/demo/foto.png" alt="Foto" width="800" height="600">',
    );

    expect(html).toContain('src="/media/news/demo/foto.png"');
  });

  it("conserva el HTML editorial permitido", () => {
    const html = renderMarkdown(
      '<figure><img src="/media/news/demo/foto.webp" alt="Foto" width="800" height="600"><figcaption>Pie</figcaption></figure>',
    );

    expect(html).toContain("<figure>");
    expect(html).toContain("<figcaption>Pie</figcaption>");
    expect(html).toContain('src="/media/news/demo/foto.webp"');
    expect(html).toContain('width="800"');
  });

  it("elimina scripts, manejadores inline y URLs peligrosas", () => {
    const html = renderMarkdown(
      [
        "Texto",
        "",
        "<script>alert(1)</script>",
        "",
        '<img src="/media/news/demo/foto.webp" alt="Foto" onerror="alert(1)">',
        "",
        '<a href="javascript:alert(1)">Enlace</a>',
      ].join("\n"),
    );

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('src="/media/news/demo/foto.webp"');
  });
});
