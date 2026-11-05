import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Security headers", () => {
  it("vercel.json tiene cabeceras de seguridad globales", () => {
    const vercelJson = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    );
    const globalHeaders = vercelJson.headers.find(
      (h: any) => h.source === "/(.*)",
    );
    expect(globalHeaders).toBeDefined();

    const keys = globalHeaders.headers.map((h: any) => h.key.toLowerCase());
    expect(keys).toContain("x-content-type-options");
    expect(keys).toContain("referrer-policy");
    expect(keys).toContain("permissions-policy");
    expect(keys).toContain("strict-transport-security");
    expect(keys).toContain("content-security-policy");

    const csp = globalHeaders.headers.find(
      (h: any) => h.key === "Content-Security-Policy",
    );
    expect(csp.value).toContain("default-src 'self'");
    expect(csp.value).toContain("script-src 'self'");
    expect(csp.value).toContain("frame-ancestors 'none'");
  });
});
