import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const ENTRY_CANDIDATES = [
  path.join(root, ".vercel", "output", "_functions", "entry.mjs"),
  path.join(
    root,
    ".vercel",
    "output",
    "functions",
    "_render.func",
    "dist",
    "server",
    "entry.mjs",
  ),
  path.join(root, ".vercel", "output", "functions", "_render.func", "index.mjs"),
];

const NOTICE_MARKDOWN = `---
title: Nota existente
description: Una noticia de prueba para el runtime
publishedAt: 2026-10-30
category: Noticias
author: Redacción
---

Cuerpo de la noticia de prueba.`;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function findEntry() {
  return ENTRY_CANDIDATES.find((candidate) => existsSync(candidate));
}

function newestSourceMtime() {
  let newest = 0;
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else newest = Math.max(newest, statSync(full).mtimeMs);
    }
  };
  walk(path.join(root, "src"));
  walk(path.join(root, "api"));
  for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"]) {
    const full = path.join(root, file);
    if (existsSync(full)) newest = Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

function ensureBuild() {
  const entry = findEntry();
  assert.ok(
    entry && statSync(entry).mtimeMs >= newestSourceMtime(),
    "falta el entrypoint SSR actual. Este test debe ejecutarse después de npm run build.",
  );
  return entry;
}

process.env.CONTENT_GITHUB_REPO = "test/repo";
process.env.CONTENT_GITHUB_TOKEN = "test-token";

const githubCalls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  githubCalls.push({ pathname: url.pathname, method: init.method ?? "GET" });

  if (url.hostname !== "api.github.com") {
    throw new Error(`Llamada de red inesperada: ${url.href}`);
  }

  if (url.pathname.endsWith("/git/trees/main")) {
    return Response.json({
      tree: [{ type: "blob", path: "content/news/nota-existente.md" }],
    });
  }

  if (url.pathname.includes("/contents/content/news/nota-existente.md")) {
    return Response.json({
      encoding: "base64",
      content: Buffer.from(NOTICE_MARKDOWN, "utf8").toString("base64"),
    });
  }

  if (url.pathname.includes("/contents/media/news/nota-existente/foto.png")) {
    return new Response(new Uint8Array(PNG), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(PNG.length),
      },
    });
  }

  return new Response("no encontrado", { status: 404 });
};

const entryPath = ensureBuild();
const imported = await import(
  `${pathToFileURL(entryPath).href}?built-runtime-test=${Date.now()}`
);
const app = imported.default;
assert.equal(typeof app?.fetch, "function", "el entrypoint SSR debe exponer fetch");

function request(pathname) {
  return app.fetch(new Request(`https://netti.test${pathname}`));
}

function countCalls(fragment) {
  return githubCalls.filter((call) => call.pathname.includes(fragment)).length;
}

test("el detalle editorial se renderiza desde el build real y permite caché CDN", async () => {
  const response = await request("/noticias/nota-existente/");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Nota existente/);
  assert.match(html, /Cuerpo de la noticia de prueba/);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/);
});

test("una noticia inexistente devuelve una respuesta 404 controlada", async () => {
  const response = await request("/noticias/no-existe-runtime/");
  const html = await response.text();

  assert.equal(response.status, 404);
  assert.match(html, /Página no encontrada|fuera del mapa/i);
  assert.equal(
    countCalls("/contents/content/news/no-existe-runtime.md"),
    1,
    "un 404 de GitHub no debe reintentarse",
  );
  assert.equal(response.headers.get("cache-control"), null);
});

test("el índice de búsqueda devuelve JSON con el contenido publicado", async () => {
  const response = await request("/search-index.json");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=300/);
  assert.ok(Array.isArray(payload));
  assert.ok(
    payload.some((item) => item.slug === "nota-existente"),
    "el índice debe incluir la noticia publicada",
  );
});

test("el endpoint multimedia valida, sirve y cachea la imagen", async () => {
  const first = await request("/media/news/nota-existente/foto.png");
  const firstBytes = Buffer.from(await first.arrayBuffer());

  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "image/png");
  assert.match(first.headers.get("cache-control") ?? "", /s-maxage=31536000/);
  assert.deepEqual(firstBytes, PNG);

  const callsAfterFirst = countCalls(
    "/contents/media/news/nota-existente/foto.png",
  );
  const second = await request("/media/news/nota-existente/foto.png");

  assert.equal(second.status, 200);
  assert.equal(
    countCalls("/contents/media/news/nota-existente/foto.png"),
    callsAfterFirst,
    "la segunda lectura debe salir de la caché en memoria",
  );
});

test("el endpoint multimedia rechaza rutas inválidas sin consultar GitHub", async () => {
  const before = githubCalls.length;

  for (const invalid of [
    "/media/content/news/nota.md",
    "/media/news/nota-existente/archivo.txt",
    "/media/news/../foto.png",
  ]) {
    const response = await request(invalid);
    assert.equal(response.status, 404, invalid);
  }

  assert.equal(githubCalls.length, before);
});
