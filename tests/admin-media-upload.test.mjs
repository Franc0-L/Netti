import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IMAGE_BYTES,
  encodeImageFile,
  uploadImageFile,
  validateImageFile,
} from "../public/admin/js/media-upload.js";

function makeFile(bytes, type = "image/png", name = "portada.png") {
  const buffer = Uint8Array.from(bytes);
  return {
    name,
    type,
    size: buffer.byteLength,
    arrayBuffer: async () => buffer.slice().buffer,
  };
}

test("valida formatos admitidos y el límite de 2 MB", () => {
  assert.equal(validateImageFile(makeFile([1, 2, 3])), "");
  assert.match(validateImageFile(makeFile([1], "image/svg+xml", "vector.svg")), /Formato no admitido/);
  assert.match(validateImageFile(makeFile([])), /vacío/);
  assert.match(validateImageFile({ ...makeFile([1]), size: MAX_IMAGE_BYTES + 1 }), /2 MB/);
});

test("codifica archivos binarios en base64 sin alterar sus bytes", async () => {
  const file = makeFile([0, 1, 2, 3, 254, 255]);
  const encoded = await encodeImageFile(file);
  assert.equal(Buffer.from(encoded, "base64").toString("hex"), "00010203feff");
});

test("sube el archivo mediante el cliente API y valida la ruta devuelta", async () => {
  let request;
  const api = {
    async post(path, body) {
      request = { path, body };
      return { ok: true, url: "/media/games/juego-demo/portada.webp", alt: "Portada" };
    },
  };
  const result = await uploadImageFile({
    api,
    file: makeFile([0x89, 0x50, 0x4e, 0x47]),
    collection: "games",
    slug: "juego-demo",
    alt: "Arte de portada",
  });

  assert.equal(request.path, "/upload");
  assert.equal(request.body.collection, "games");
  assert.equal(request.body.slug, "juego-demo");
  assert.equal(request.body.mimeType, "image/png");
  assert.equal(request.body.filename, "portada.png");
  assert.equal(request.body.alt, "Arte de portada");
  assert.equal(request.body.data, "iVBORw==");
  assert.equal(result.url, "/media/games/juego-demo/portada.webp");
});

test("rechaza metadatos demasiado largos antes de llamar a la API", async () => {\n  const api = { async post() { throw new Error("No debería llamar a la API"); } };\n  await assert.rejects(uploadImageFile({ api, file: makeFile([1]), collection: "games", slug: "juego-demo", alt: "x".repeat(241) }), /240 caracteres/);\n});\n\ntest("rechaza archivos inválidos antes de llamar a la API", async () => {
  let called = false;
  const api = { async post() { called = true; } };
  await assert.rejects(
    uploadImageFile({
      api,
      file: makeFile([1, 2], "image/svg+xml", "vector.svg"),
      collection: "games",
      slug: "juego-demo",
    }),
    /Formato no admitido/,
  );
  assert.equal(called, false);
});

test("rechaza rutas de medios inseguras devueltas por el servidor", async () => {
  const api = { async post() { return { url: "javascript:alert(1)" }; } };
  await assert.rejects(
    uploadImageFile({
      api,
      file: makeFile([1, 2]),
      collection: "games",
      slug: "juego-demo",
    }),
    /ruta de imagen no válida/,
  );
});
