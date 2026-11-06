import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasSession: vi.fn(),
  assertSameOrigin: vi.fn(),
  logAdminError: vi.fn(),
  getRequiredEnv: vi.fn(),
  dryRunDelete: vi.fn(),
  performDelete: vi.fn(),
  findEntryBySlug: vi.fn(),
  invalidateTreeCache: vi.fn(),
  listEntries: vi.fn(),
  listMediaEntries: vi.fn(),
  listTrashEntries: vi.fn(),
  readEntryBySlug: vi.fn(),
  validate: vi.fn(),
  deleteMarkdownFile: vi.fn(),
  writeMarkdownFile: vi.fn(),
}));

vi.mock("../api/_lib/security.js", () => ({
  hasSession: mocks.hasSession,
  assertSameOrigin: mocks.assertSameOrigin,
  logAdminError: mocks.logAdminError,
  json: (res: any, status: number, body: unknown) => {
    res
      .status(status)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "no-store")
      .send(JSON.stringify(body));
  },
}));

vi.mock("../src/lib/env-config.js", () => ({
  getRequiredEnv: mocks.getRequiredEnv,
}));

vi.mock("../api/_lib/content/trash.js", () => ({
  dryRunDelete: mocks.dryRunDelete,
  performDelete: mocks.performDelete,
}));

vi.mock("../api/_lib/content/repository.js", () => ({
  findEntryBySlug: mocks.findEntryBySlug,
  invalidateTreeCache: mocks.invalidateTreeCache,
  listEntries: mocks.listEntries,
  listMediaEntries: mocks.listMediaEntries,
  listTrashEntries: mocks.listTrashEntries,
  readEntryBySlug: mocks.readEntryBySlug,
}));

vi.mock("../api/_lib/content/validation.js", () => ({
  validate: mocks.validate,
}));

vi.mock("../api/_lib/github/contents.js", () => ({
  deleteMarkdownFile: mocks.deleteMarkdownFile,
  writeMarkdownFile: mocks.writeMarkdownFile,
}));

import handler from "../api/admin/content.js";

function makeRequest(method: string, body?: unknown, query?: Record<string, string>) {
  return {
    method,
    headers: {
      origin: "https://netti.example",
      host: "netti.example",
    },
    query,
    body,
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    send(value: string) {
      this.payload = JSON.parse(value);
      return this;
    },
    json(value: unknown) {
      this.payload = value;
      return this;
    },
  };
}

async function call(method: string, body?: unknown, query?: Record<string, string>) {
  const req = makeRequest(method, body, query);
  const res = makeResponse();
  await handler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasSession.mockReturnValue(true);
  mocks.assertSameOrigin.mockReturnValue(true);
  mocks.getRequiredEnv.mockReturnValue("configured");
  mocks.validate.mockReturnValue(undefined);
  mocks.findEntryBySlug.mockResolvedValue(null);
  mocks.listEntries.mockResolvedValue({
    entries: [],
    page: 1,
    pageSize: 50,
    pageCount: 0,
    total: 0,
  });
  mocks.listMediaEntries.mockResolvedValue({ entries: [], page: 1, total: 0 });
  mocks.listTrashEntries.mockResolvedValue({ entries: [], page: 1, total: 0 });
  mocks.writeMarkdownFile.mockResolvedValue({ commit: "commit-created" });
  mocks.deleteMarkdownFile.mockResolvedValue({ commit: "commit-deleted" });
  mocks.readEntryBySlug.mockResolvedValue({
    collection: "news",
    slug: ".deleted/removed",
    title: "Noticia recuperable",
    fields: { title: "Noticia recuperable", deletedSlug: "noticia-original" },
    body: "Contenido recuperable.",
    sha: "trash-sha",
  });
  mocks.dryRunDelete.mockResolvedValue({
    file: "content/news/noticia.md",
    fileSha: "file-sha",
    media: { toDelete: [], toKeep: [] },
  });
  mocks.performDelete.mockResolvedValue({
    file: "content/news/noticia.md",
    trashed: "content/news/.deleted/noticia.md",
    mediaDeleted: [],
    mediaTrashed: [],
    mediaDeleteFailed: [],
    mediaKept: [],
    commit: "delete-commit",
    recoverable: true,
  });
});

describe("API Admin de contenido", () => {
  it("rechaza solicitudes sin sesión", async () => {
    mocks.hasSession.mockReturnValue(false);

    const res = await call("GET");

    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({ error: "Iniciá sesión para continuar." });
    expect(mocks.getRequiredEnv).not.toHaveBeenCalled();
  });

  it("rechaza métodos no permitidos", async () => {
    const res = await call("PATCH");

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET, POST, PUT, DELETE");
  });

  it("rechaza escrituras de otro origen", async () => {
    mocks.assertSameOrigin.mockReturnValue(false);

    const res = await call("POST", {});

    expect(res.statusCode).toBe(403);
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled();
  });

  it("devuelve 503 cuando falta el token de GitHub", async () => {
    mocks.getRequiredEnv.mockImplementation(() => {
      throw new Error("missing token");
    });

    const res = await call("GET");

    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({
      error: "Falta configurar CONTENT_GITHUB_TOKEN en el servidor.",
    });
  });

  it("lista medios mediante la ruta de colección correspondiente", async () => {
    mocks.listMediaEntries.mockResolvedValue({
      entries: [{ slug: "media/news/post/cover.webp" }],
      page: 2,
      total: 51,
    });

    const res = await call("GET", undefined, { collection: "media", page: "2" });

    expect(res.statusCode).toBe(200);
    expect(mocks.listMediaEntries).toHaveBeenCalledWith(2);
    expect(res.payload).toMatchObject({ page: 2, total: 51 });
  });

  it("rechaza números de página inválidos antes de consultar el repositorio", async () => {
    const res = await call("GET", undefined, { collection: "news", page: "0" });

    expect(res.statusCode).toBe(400);
    expect(mocks.listEntries).not.toHaveBeenCalled();
  });

  it("crea una noticia después de validar sus campos", async () => {
    const res = await call("POST", {
      collection: "news",
      slug: "nueva-noticia",
      fields: {
        title: "Nueva noticia",
        description: "Una descripción suficiente.",
        publishedAt: "2026-11-06",
        category: "Noticias",
        author: "Netti",
      },
      body: "Contenido de la noticia.",
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.writeMarkdownFile).toHaveBeenCalledWith(
      "news",
      "nueva-noticia",
      expect.objectContaining({ title: "Nueva noticia" }),
      "Contenido de la noticia.",
      undefined,
    );
    expect(res.payload).toMatchObject({ ok: true, commit: "commit-created" });
  });

  it("no pisa una publicación si el SHA de edición quedó desactualizado", async () => {
    mocks.findEntryBySlug.mockResolvedValue({
      collection: "news",
      slug: "noticia",
      sha: "new-sha",
      page: 1,
    });

    const res = await call("PUT", {
      collection: "news",
      slug: "noticia",
      sha: "old-sha",
      fields: { title: "Noticia", description: "Descripción" },
      body: "Contenido actualizado.",
    });

    expect(res.statusCode).toBe(409);
    expect(mocks.writeMarkdownFile).not.toHaveBeenCalled();
  });

  it("devuelve el análisis previo al borrado sin ejecutar el borrado", async () => {
    const res = await call("DELETE", {
      collection: "news",
      slug: "noticia",
      sha: "file-sha",
      dryRun: true,
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.dryRunDelete).toHaveBeenCalledWith("news", "noticia", "file-sha");
    expect(mocks.performDelete).not.toHaveBeenCalled();
    expect(res.payload).toMatchObject({ ok: true, dryRun: true });
  });

  it("mueve una publicación a la papelera mediante el flujo recuperable", async () => {
    const res = await call("DELETE", {
      collection: "news",
      slug: "noticia",
      sha: "file-sha",
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.performDelete).toHaveBeenCalledWith("news", "noticia", "file-sha");
    expect(res.payload).toMatchObject({
      ok: true,
      recoverable: true,
      trashed: "content/news/.deleted/noticia.md",
    });
  });

  it("restaura una publicación y elimina su copia de la papelera", async () => {
    const res = await call("POST", {
      action: "restore",
      collection: "news",
      slug: "removed",
      sha: "trash-sha",
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.writeMarkdownFile).toHaveBeenCalledWith(
      "news",
      "noticia-original",
      { title: "Noticia recuperable" },
      "Contenido recuperable.",
    );
    expect(mocks.deleteMarkdownFile).toHaveBeenCalledWith(
      "news",
      ".deleted/removed",
      "trash-sha",
    );
    expect(res.payload).toMatchObject({ ok: true, slug: "noticia-original" });
  });
});
