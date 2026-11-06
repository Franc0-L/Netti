import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditMedia } from "../scripts/media-audit.js";

const temporaryDirectories: string[] = [];

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "netti-media-audit-"));
  temporaryDirectories.push(root);
  return root;
}

function write(root: string, path: string, content = ""): void {
  const file = join(root, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("auditoría de medios", () => {
  it("detecta imágenes referenciadas desde frontmatter y cuerpo", () => {
    const root = createRepository();
    write(
      root,
      "content/news/live.md",
      [
        "---",
        'coverImage: "/media/news/live/cover.webp"',
        "---",
        "",
        "![Captura](/media/news/shared/capture.png)",
      ].join("\n"),
    );
    write(root, "media/news/live/cover.webp", "image");
    write(root, "media/news/shared/capture.png", "image");
    write(root, "media/news/orphan/orphan.jpg", "image");

    const result = auditMedia(root);

    expect(result.totalMedia).toBe(3);
    expect(result.referencedMedia).toBe(2);
    expect(result.orphaned.map((entry) => entry.path)).toEqual([
      "media/news/orphan/orphan.jpg",
    ]);
  });

  it("conserva como referenciadas las imágenes usadas por publicaciones en papelera", () => {
    const root = createRepository();
    write(
      root,
      "content/news/.deleted/removed.md",
      '---\ncoverImage: "/media/news/removed/cover.avif"\n---\nContenido eliminado.',
    );
    write(root, "media/news/removed/cover.avif", "image");

    const result = auditMedia(root);

    expect(result.orphaned).toEqual([]);
    expect(result.referencedMedia).toBe(1);
  });

  it("informa todas las imágenes como huérfanas cuando no hay referencias", () => {
    const root = createRepository();
    write(root, "content/news/entry.md", "---\ntitle: Sin imágenes\n---\nTexto.");
    write(root, "media/news/entry/one.gif", "image");
    write(root, "media/news/entry/two.jpg", "image");

    const result = auditMedia(root);

    expect(result.orphaned).toHaveLength(2);
    expect(result.referencedMedia).toBe(0);
  });

  it("falla con un mensaje claro si falta content/", () => {
    const root = createRepository();
    expect(() => auditMedia(root)).toThrow(/No se encontró la carpeta content/);
  });
});
