import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const root = process.cwd();
const outDir = mkdtempSync(path.join(root, ".netti-admin-e2e-"));
process.on("exit", () => rmSync(outDir, { recursive: true, force: true }));

const SECRET = "netti-e2e-secret-0123456789abcdef";
const PASSWORD = "netti-e2e-password-long-enough";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let moduleCounter = 0;
async function load(entry) {
  const outfile = path.join(outDir, path.basename(entry, ".ts") + "-" + moduleCounter++ + ".mjs");
  buildSync({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["yaml", "sharp"],
    logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}

function baseEnv() {
  process.env.CONTENT_GITHUB_REPO = "test/repo";
  process.env.CONTENT_GITHUB_TOKEN = "test-token";
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.NODE_ENV = "test";
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    send(value) {
      this.payload = value;
      return this;
    },
    json() {
      return this.payload === undefined ? undefined : JSON.parse(this.payload);
    },
  };
}

function makeRequest(overrides = {}) {
  return {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: "http://localhost",
      host: "localhost",
    },
    body: undefined,
    query: {},
    ...overrides,
  };
}

function mockGitHub(handler = () => ({ status: 200, body: {} })) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const call = {
      url: parsed,
      method: init.method || "GET",
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const result = handler(call) || { status: 200, body: {} };
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: { get: () => null },
      json: async () => result.body ?? {},
    };
  };
  return calls;
}

baseEnv();
const { createSession } = await load("api/_lib/security.ts");
const sessionCookie = "netti_admin=" + encodeURIComponent(createSession(SECRET));

test("el login real crea una sesión y devuelve cookie segura para el panel", async () => {
  baseEnv();
  const { default: handler } = await load("api/admin/login.ts");
  const res = makeResponse();
  await handler(makeRequest({ headers: { origin: "http://localhost", host: "localhost" }, body: { password: PASSWORD } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.match(res.headers["set-cookie"], /netti_admin=/);
  assert.match(res.headers["set-cookie"], /HttpOnly/);
  assert.match(res.headers["set-cookie"], /SameSite=Strict/);
});

test("el handler real crea una noticia y confirma el commit de GitHub", async () => {
  baseEnv();
  const calls = mockGitHub((call) => {
    if (call.url.pathname.endsWith("/git/trees/main")) {
      return { status: 200, body: { tree: [] } };
    }
    if (call.method === "PUT" && call.url.pathname.includes("/contents/content/news/")) {
      return { status: 201, body: { content: { path: "content/news/noticia-e2e.md" }, commit: { sha: "commit-e2e" } } };
    }
    return { status: 200, body: {} };
  });
  const { default: handler } = await load("api/admin/content.ts");
  const res = makeResponse();
  await handler(makeRequest({
    body: {
      collection: "news",
      slug: "noticia-e2e",
      fields: {
        title: "Noticia E2E",
        description: "Una descripción para la prueba integral.",
        publishedAt: "2026-11-06",
        category: "Noticias",
        author: "Netti",
      },
      body: "Contenido de prueba del handler.",
    },
  }), res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  assert.deepEqual(res.json(), { ok: true, commit: "commit-e2e", slug: "noticia-e2e", page: 1 });
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
});

test("el handler real rechaza una publicación duplicada sin escribir", async () => {
  baseEnv();
  const calls = mockGitHub((call) => {
    if (call.url.pathname.endsWith("/git/trees/main")) {
      return { status: 200, body: { tree: [{ type: "blob", path: "content/news/existente.md", sha: "existing-sha" }] } };
    }
    if (call.url.pathname.includes("/git/blobs/existing-sha")) {
      const markdown = Buffer.from("---\ntitle: Existente\ndescription: Descripción\npublishedAt: 2026-11-06\ncategory: Noticias\nauthor: Netti\n---\n\nContenido.", "utf8").toString("base64");
      return { status: 200, body: { encoding: "base64", content: markdown } };
    }
    return { status: 200, body: {} };
  });
  const { default: handler } = await load("api/admin/content.ts");
  const res = makeResponse();
  await handler(makeRequest({
    body: {
      collection: "news",
      slug: "existente",
      fields: {
        title: "Noticia duplicada",
        description: "Descripción suficiente.",
        publishedAt: "2026-11-06",
        category: "Noticias",
        author: "Netti",
      },
      body: "Contenido.",
    },
  }), res);

  assert.equal(res.statusCode, 409);
  assert.match(res.json().error, /ya existe/i);
  assert.equal(calls.filter((call) => call.method === "PUT").length, 0);
});

test("el handler real sube una imagen válida y devuelve su ruta pública", async () => {
  baseEnv();
  const calls = mockGitHub((call) => ({
    status: 201,
    body: { content: { path: "media/games/juego-e2e/cover.png" }, commit: { sha: "media-commit" } },
  }));
  const { default: handler } = await load("api/admin/upload.ts");
  const res = makeResponse();
  await handler(makeRequest({
    body: {
      collection: "games",
      slug: "juego-e2e",
      mimeType: "image/png",
      data: PNG.toString("base64"),
      alt: "Portada de prueba",
      filename: "cover.png",
    },
  }), res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.json()));
  assert.equal(res.json().ok, true);
  assert.match(res.json().url, /^\/media\/games\/juego-e2e\/[0-9a-f-]+\.(?:webp|png)$/);
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
});

test("el handler real rechaza una imagen con MIME no admitido antes de llamar a GitHub", async () => {
  baseEnv();
  const calls = mockGitHub();
  const { default: handler } = await load("api/admin/upload.ts");
  const res = makeResponse();
  await handler(makeRequest({
    body: {
      collection: "games",
      slug: "juego-e2e",
      mimeType: "image/svg+xml",
      data: Buffer.from("<svg></svg>").toString("base64"),
      alt: "Vector no permitido",
      filename: "cover.svg",
    },
  }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /Formato no admitido/);
  assert.equal(calls.length, 0);
});


const EXISTING_NEWS = `---
title: Noticia existente
description: Una noticia que ya está publicada.
publishedAt: 2026-11-05
category: Noticias
author: Netti
---

Contenido original de la noticia.`;

function contentTree(path, sha) {
  return { type: "blob", path, sha };
}

test("el handler real edita una noticia usando el SHA actual de GitHub", async () => {
  baseEnv();
  const calls = mockGitHub((call) => {
    if (call.url.pathname.endsWith("/git/trees/main")) {
      return {
        status: 200,
        body: {
          tree: [contentTree("content/news/noticia-e2e.md", "current-sha")],
        },
      };
    }
    if (call.url.pathname.endsWith("/git/blobs/current-sha")) {
      return {
        status: 200,
        body: {
          encoding: "base64",
          content: Buffer.from(EXISTING_NEWS, "utf8").toString("base64"),
        },
      };
    }
    if (
      call.method === "PUT" &&
      call.url.pathname.endsWith("/contents/content/news/noticia-e2e.md")
    ) {
      return {
        status: 200,
        body: { commit: { sha: "commit-edit" } },
      };
    }
    return { status: 200, body: {} };
  });

  const { default: handler } = await load("api/admin/content.ts");
  const res = makeResponse();
  await handler(
    makeRequest({
      method: "PUT",
      body: {
        collection: "news",
        slug: "noticia-e2e",
        sha: "current-sha",
        fields: {
          title: "Noticia editada",
          description: "Una descripción actualizada para la prueba.",
          publishedAt: "2026-11-06",
          category: "Actualidad",
          author: "Netti",
        },
        body: "Contenido actualizado.",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  assert.deepEqual(res.json(), {
    ok: true,
    commit: "commit-edit",
    slug: "noticia-e2e",
    page: 1,
  });
  const write = calls.find(
    (call) =>
      call.method === "PUT" &&
      call.url.pathname.endsWith("/contents/content/news/noticia-e2e.md"),
  );
  assert.ok(write, "debe escribir el archivo original");
  assert.equal(write.body.sha, "current-sha");
  assert.match(
    Buffer.from(write.body.content, "base64").toString("utf8"),
    /Noticia editada/,
  );
});

test("el handler real mueve una noticia a la papelera y elimina el original", async () => {
  baseEnv();
  const calls = mockGitHub((call) => {
    if (call.url.pathname.endsWith("/git/trees/main")) {
      return {
        status: 200,
        body: {
          tree: [contentTree("content/news/noticia-e2e.md", "delete-sha")],
        },
      };
    }
    if (call.url.pathname.endsWith("/git/blobs/delete-sha")) {
      return {
        status: 200,
        body: {
          encoding: "base64",
          content: Buffer.from(EXISTING_NEWS, "utf8").toString("base64"),
        },
      };
    }
    if (
      call.method === "PUT" &&
      call.url.pathname.includes("/contents/content/news/.deleted/")
    ) {
      return {
        status: 201,
        body: { commit: { sha: "commit-trash" } },
      };
    }
    if (
      call.method === "DELETE" &&
      call.url.pathname.endsWith("/contents/content/news/noticia-e2e.md")
    ) {
      return {
        status: 200,
        body: { commit: { sha: "commit-delete" } },
      };
    }
    return { status: 200, body: {} };
  });

  const { default: handler } = await load("api/admin/content.ts");
  const res = makeResponse();
  await handler(
    makeRequest({
      method: "DELETE",
      body: {
        collection: "news",
        slug: "noticia-e2e",
        sha: "delete-sha",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  assert.equal(res.json().ok, true);
  assert.equal(res.json().recoverable, true);
  assert.equal(
    res.json().trashed.startsWith("content/news/.deleted/noticia-e2e-deleted-"),
    true,
  );
  assert.ok(
    calls.some(
      (call) =>
        call.method === "PUT" &&
        call.url.pathname.includes("/contents/content/news/.deleted/"),
    ),
    "primero debe guardar una copia recuperable",
  );
  assert.ok(
    calls.some(
      (call) =>
        call.method === "DELETE" &&
        call.url.pathname.endsWith("/contents/content/news/noticia-e2e.md"),
    ),
    "después debe eliminar el archivo original",
  );
});

test("el handler real restaura una noticia y elimina su copia de la papelera", async () => {
  baseEnv();
  const trashedNews = `---
title: Noticia recuperable
description: Una noticia que se va a restaurar.
publishedAt: 2026-11-05
category: Noticias
author: Netti
deleted: true
deletedSlug: noticia-original
deletedCollection: news
deletedReason: Eliminado desde el panel editorial
---

Contenido que debe recuperarse.`;
  const calls = mockGitHub((call) => {
    if (call.url.pathname.endsWith("/git/trees/main")) {
      return {
        status: 200,
        body: {
          tree: [
            contentTree(
              "content/news/.deleted/noticia-original-deleted.md",
              "trash-sha",
            ),
          ],
        },
      };
    }
    if (call.url.pathname.endsWith("/git/blobs/trash-sha")) {
      return {
        status: 200,
        body: {
          encoding: "base64",
          content: Buffer.from(trashedNews, "utf8").toString("base64"),
        },
      };
    }
    if (
      call.method === "PUT" &&
      call.url.pathname.endsWith("/contents/content/news/noticia-original.md")
    ) {
      return {
        status: 201,
        body: { commit: { sha: "commit-restore" } },
      };
    }
    if (
      call.method === "DELETE" &&
      call.url.pathname.endsWith(
        "/contents/content/news/.deleted/noticia-original-deleted.md",
      )
    ) {
      return {
        status: 200,
        body: { commit: { sha: "commit-cleanup" } },
      };
    }
    return { status: 200, body: {} };
  });

  const { default: handler } = await load("api/admin/content.ts");
  const res = makeResponse();
  await handler(
    makeRequest({
      body: {
        action: "restore",
        collection: "news",
        slug: "noticia-original-deleted",
        sha: "trash-sha",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  assert.deepEqual(res.json(), {
    ok: true,
    slug: "noticia-original",
    commit: "commit-restore",
  });
  const restoredWrite = calls.find(
    (call) =>
      call.method === "PUT" &&
      call.url.pathname.endsWith("/contents/content/news/noticia-original.md"),
  );
  assert.ok(restoredWrite, "debe volver a crear la publicación original");
  const restoredMarkdown = Buffer.from(
    restoredWrite.body.content,
    "base64",
  ).toString("utf8");
  assert.match(restoredMarkdown, /Noticia recuperable/);
  assert.doesNotMatch(restoredMarkdown, /deletedSlug|deletedCollection|deletedReason/);
  assert.ok(
    calls.some(
      (call) =>
        call.method === "DELETE" &&
        call.url.pathname.endsWith(
          "/contents/content/news/.deleted/noticia-original-deleted.md",
        ),
    ),
    "debe limpiar la copia de la papelera",
  );
});
