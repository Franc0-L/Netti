import test from "node:test";
import assert from "node:assert/strict";
import { createAdminApi } from "../public/admin/js/api-client.js";

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("GET construye la URL del administrador y devuelve JSON", async () => {
  const calls = [];
  const api = createAdminApi({ baseUrl: "/api/admin", fetchImpl: async (...args) => {
    calls.push(args); return response(200, { entries: [] });
  }});
  assert.deepEqual(await api.get("/content?page=1"), { entries: [] });
  assert.equal(calls[0][0], "/api/admin/content?page=1");
  assert.equal(calls[0][1].method, "GET");
});

test("POST serializa el cuerpo y establece Content-Type", async () => {
  let call;
  const api = createAdminApi({ fetchImpl: async (...args) => {
    call = args; return response(200, { ok: true });
  }});
  await api.post("/content", { collection: "games" });
  assert.equal(call[1].method, "POST");
  assert.equal(call[1].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(call[1].body), { collection: "games" });
});

test("DELETE admite cuerpo JSON", async () => {
  let call;
  const api = createAdminApi({ fetchImpl: async (...args) => {
    call = args; return response(200, { ok: true });
  }});
  await api.delete("/content", { collection: "games", slug: "demo" });
  assert.equal(call[1].method, "DELETE");
  assert.deepEqual(JSON.parse(call[1].body), { collection: "games", slug: "demo" });
});

test("propaga el mensaje de error enviado por la API", async () => {
  const api = createAdminApi({ fetchImpl: async () => response(409, { error: "La publicación cambió." }) });
  await assert.rejects(api.put("/content", {}), { message: "La publicación cambió." });
});

test("usa un mensaje HTTP seguro si la respuesta no contiene JSON válido", async () => {
  const api = createAdminApi({ fetchImpl: async () => ({
    ok: false, status: 502, json: async () => { throw new SyntaxError("invalid json"); },
  })});
  await assert.rejects(api.get("/content"), { message: "La solicitud falló (HTTP 502)." });
});
