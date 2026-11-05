import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("tiene safeRepoPath contra path traversal", () => {
    const source = readFileSync(mediaPath, "utf8");
    expect(source).toContain("safeRepoPath");
    expect(source).toContain("..");
    expect(source).toContain("\\\\");
  });

  it("tiene caché en memoria para medios", () => {
    const source = readFileSync(mediaPath, "utf8");
    expect(source).toContain("cache");
    expect(source).toContain("expiresAt");
  });
});
