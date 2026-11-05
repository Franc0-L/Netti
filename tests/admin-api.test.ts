import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Admin API - archivos y lógica", () => {
  const root = process.cwd();

  it("api/admin/login.ts existe y tiene rate limiting", () => {
    const source = readFileSync(join(root, "api", "admin", "login.ts"), "utf8");
    expect(source).toContain("MAX_ATTEMPTS");
    expect(source).toContain("GLOBAL_MAX_ATTEMPTS");
    expect(source).toContain("429");
  });

  it("api/admin/login.ts usa timingSafeEqual", () => {
    const source = readFileSync(join(root, "api", "admin", "login.ts"), "utf8");
    expect(source).toContain("timingSafeEqual");
    expect(source).toContain("node:crypto");
  });

  it("api/admin/login.ts importa assertSameOrigin", () => {
    const source = readFileSync(join(root, "api", "admin", "login.ts"), "utf8");
    expect(source).toContain("assertSameOrigin");
  });

  it("api/admin/content.ts existe y valida sesión", () => {
    const source = readFileSync(join(root, "api", "admin", "content.ts"), "utf8");
    expect(source).toContain("hasSession");
    expect(source).toContain("assertSameOrigin");
  });

  it("api/admin/content.ts valida campos con schemas", () => {
    const source = readFileSync(join(root, "api", "admin", "content.ts"), "utf8");
    expect(source).toContain("validate(");
  });

  it("api/admin/upload.ts existe y valida tipos de imagen", () => {
    const source = readFileSync(join(root, "api", "admin", "upload.ts"), "utf8");
    expect(source).toContain("image/jpeg");
    expect(source).toContain("image/png");
    expect(source).toContain("image/webp");
    expect(source).toContain("maxBytes");
  });

  it("api/_lib/security.ts existe con funciones de sesión", () => {
    const source = readFileSync(join(root, "api", "_lib", "security.ts"), "utf8");
    expect(source).toContain("createSession");
    expect(source).toContain("isValidSession");
    expect(source).toContain("createHmac");
    expect(source).toContain("timingSafeEqual");
  });

  it("api/_lib/security.ts tiene COOKIE_NAME y SESSION_SECONDS", () => {
    const source = readFileSync(join(root, "api", "_lib", "security.ts"), "utf8");
    expect(source).toContain("COOKIE_NAME");
    expect(source).toContain("SESSION_SECONDS");
  });
});
