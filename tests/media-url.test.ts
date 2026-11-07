import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeRepoPath } from "../src/pages/media/[...path].ts";

describe("Media endpoint - validación de magic bytes", () => {
  const root = process.cwd();
  const mediaPath = join(root, "src", "pages", "media", "[...path].ts");

  it("el archivo del endpoint existe", () => {
    expect(readFileSync(mediaPath, "utf8")).toContain("hasValidMagicBytes");
  });

  it("tiene validación de magic bytes para PNG", () => {
    const source = readFileSync(mediaPath, "utf8");
    expect(source).toContain("0x89, 0x50, 0x4e, 0x47");
  });

  it("tiene validación de magic bytes para JPEG", () => {
    const source = readFileSync(mediaPath, "utf8");
    expect(source).toContain("0xff, 0xd8, 0xff");
  });

  it("tiene validación de magic bytes para WebP", () => {
    const source = readFileSync(mediaPath, "utf8");
    expect(source).toContain("RIFF");
    expect(source).toContain("WEBP");
  });

  it("tiene caché en memoria para medios", () => {
    const source = readFileSync(mediaPath, "utf8");
    expect(source).toContain("cache");
    expect(source).toContain("expiresAt");
  });
});

describe("Media endpoint - safeRepoPath contra path traversal", () => {
  it("acepta una ruta válida de media", () => {
    expect(safeRepoPath("news/demo/foto.webp")).toBe("media/news/demo/foto.webp");
  });

  it("normaliza la barra inicial", () => {
    expect(safeRepoPath("/news/demo/foto.webp")).toBe(
      "media/news/demo/foto.webp",
    );
  });

  it("no duplica el prefijo media", () => {
    expect(safeRepoPath("media/news/demo/foto.png")).toBe(
      "media/news/demo/foto.png",
    );
  });

  it("rechaza segmentos de escape sin decodificar", () => {
    expect(safeRepoPath("news/../../etc/passwd.png")).toBeNull();
  });

  it("rechaza segmentos de escape codificados (%2e)", () => {
    expect(safeRepoPath("news/%2e%2e/secret/foto.png")).toBeNull();
  });

  it("rechaza barras invertidas", () => {
    expect(safeRepoPath("news\\..\\secret\\foto.png")).toBeNull();
  });

  it("rechaza colecciones fuera de la allowlist", () => {
    expect(safeRepoPath("secretos/demo/foto.png")).toBeNull();
  });

  it("rechaza extensiones no permitidas", () => {
    expect(safeRepoPath("news/demo/script.svg")).toBeNull();
    expect(safeRepoPath("news/demo/archivo")).toBeNull();
  });

  it("rechaza segmentos vacíos", () => {
    expect(safeRepoPath("news//foto.png")).toBeNull();
  });
});
