import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Platform logos", () => {
  const root = process.cwd();
  const logosPath = join(root, "src", "lib", "platform-logos.js");

  it("src/lib/platform-logos.js existe y tiene contenido", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source.length).toBeGreaterThan(0);
  });

  it("define PLATFORM_PRESETS", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("PLATFORM_PRESETS");
  });

  it("define PLATFORM_IMAGES", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("PLATFORM_IMAGES");
  });

  it("tiene preset para Nintendo Switch", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("switch");
    expect(source).toContain("Nintendo Switch");
  });

  it("tiene preset para PlayStation", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("playstation");
    expect(source).toContain("PlayStation");
  });

  it("tiene preset para Xbox", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("xbox");
    expect(source).toContain("Xbox");
  });

  it("tiene preset para PC", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("computer");
    expect(source).toContain("PC");
  });

  it("exporta platformSymbol", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("platformSymbol");
  });

  it("exporta platformImage", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("platformImage");
  });

  it("exporta canonicalizePlatforms", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("canonicalizePlatforms");
  });

  it("exporta catalogForAdmin", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("catalogForAdmin");
  });

  it("define rutas de imagen de plataformas", () => {
    const source = readFileSync(logosPath, "utf8");
    expect(source).toContain("/images/platforms/switch");
    expect(source).toContain("/images/platforms/playstation");
    expect(source).toContain("/images/platforms/xbox");
    expect(source).toContain("/images/platforms/pc");
  });
});
