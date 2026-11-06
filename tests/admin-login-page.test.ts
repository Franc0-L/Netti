import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Página de inicio de sesión del panel", () => {
  const root = process.cwd();
  const html = readFileSync(join(root, "public", "admin", "index.html"), "utf8");
  const script = readFileSync(
    join(root, "public", "admin", "js", "login.js"),
    "utf8",
  );
  const panel = readFileSync(
    join(root, "public", "admin", "panel.html"),
    "utf8",
  );

  it("carga el comportamiento desde un archivo externo permitido por CSP", () => {
    expect(html).toContain('<script src="/admin/js/login.js" defer></script>');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  });

  it("envía el formulario al endpoint de autenticación", () => {
    expect(html).toContain('action="/api/admin/login"');
    expect(html).toContain('method="post"');
    expect(script).toContain("event.preventDefault()");
    expect(script).toContain("fetch(form.action");
    expect(script).toContain('credentials: "same-origin"');
  });

  it("redirige al panel real después de autenticar, no al formulario de login", () => {
    expect(script).toContain('window.location.assign("/admin/panel.html")');
    expect(panel).toContain('<script src="/admin/js/panel.js"></script>');
  });
});
