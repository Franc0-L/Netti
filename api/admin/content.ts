import {
  assertSameOrigin,
  hasSession,
  json,
  logAdminError,
} from "../_lib/security.js";
import { getRequiredEnv } from "../../src/lib/env-config.js";
import { dryRunDelete, performDelete } from "../_lib/content/trash.js";
import { findEntryBySlug, invalidateTreeCache, listEntries, listMediaEntries, listTrashEntries, readEntryBySlug } from "../_lib/content/repository.js";
import { validate } from "../_lib/content/validation.js";
import { deleteMarkdownFile, writeMarkdownFile } from "../_lib/github/contents.js";

const collections = new Set(["games", "reviews", "news", "guides"]);

interface AdminRequest {
  method?: string;
  headers?: { [key: string]: string | string[] | undefined };
  query?: { [key: string]: string | string[] | undefined };
  body?: unknown;
}

interface AdminResponse {
  status(code: number): AdminResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
  json(body: unknown): void;
}

export default async function handler(req: AdminRequest, res: AdminResponse) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return json(res, 405, { error: "Método no permitido." });
  }
  if (!hasSession(req))
    return json(res, 401, { error: "Iniciá sesión para continuar." });
  if (req.method !== "GET" && !assertSameOrigin(req))
    return json(res, 403, { error: "Origen no permitido." });

  try {
    getRequiredEnv("CONTENT_GITHUB_TOKEN");
  } catch {
    return json(res, 503, {
      error: "Falta configurar CONTENT_GITHUB_TOKEN en el servidor.",
    });
  }

  try {
    if (req.method === "GET") {
      const rawCollection = req.query?.collection;
      if (rawCollection !== undefined && typeof rawCollection !== "string") {
        return json(res, 400, { error: "Colección desconocida." });
      }
      const collection = rawCollection as string;
      if (collection && !collections.has(collection) && !["trash", "media"].includes(collection)) {
        return json(res, 400, { error: "Colección desconocida." });
      }

      const rawSlug = req.query?.slug;
      if (rawSlug !== undefined) {
        if (!collection || !collections.has(collection) || typeof rawSlug !== "string") {
          return json(res, 400, {
            error: "La publicación solicitada no es válida.",
          });
        }
        const slug = rawSlug as string;
        try {
          const entry = await readEntryBySlug(collection, slug);
          return json(res, 200, { entry });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("No se encontró")
          ) {
            return json(res, 404, {
              error: "No se encontró la publicación solicitada.",
            });
          }
          return json(res, 500, { error: "Error al leer la publicación." });
        }
      }

      const rawPage = req.query?.page;
      if (
        rawPage !== undefined &&
        (typeof rawPage !== "string" || !/^[1-9]\d*$/.test(rawPage))
      ) {
        return json(res, 400, { error: "La página solicitada no es válida." });
      }
      const pageStr = rawPage as string;
      const page = pageStr === undefined ? 1 : Number(pageStr);
      if (collection === "trash") return json(res, 200, await listTrashEntries(page));
      if (collection === "media") return json(res, 200, await listMediaEntries(page));
      const result = await listEntries(collection, page);
      return json(res, 200, result);
    }

    if (req.method === "DELETE") {
      let body: unknown;
      try {
        body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch {
        return json(res, 400, {
          error: "El cuerpo de la solicitud no contiene JSON válido.",
        });
      }
      const data = body as {
        collection?: unknown;
        slug?: unknown;
        sha?: unknown;
        dryRun?: unknown;
      };
      const collection = data.collection;
      const slug = data.slug;
      const sha = data.sha;
      const dryRun = data.dryRun === true;

      if (typeof collection !== "string" || !collections.has(collection)) {
        return json(res, 400, { error: "Colección desconocida." });
      }
      if (typeof slug !== "string" || slug.length > 80) {
        return json(res, 400, { error: "El slug no es válido." });
      }
      if (typeof sha !== "string") {
        return json(res, 400, { error: "El sha es obligatorio." });
      }

      if (dryRun) {
        try {
          const report = await dryRunDelete(collection, slug, sha);
          return json(res, 200, { ok: true, dryRun: true, ...report });
        } catch (error) {
          logAdminError("content_delete_dryrun", req, error, 500);
          return json(res, 500, {
            error: error instanceof Error ? error.message : "Error interno.",
          });
        }
      }

      try {
        const result = await performDelete(collection, slug, sha);
        return json(res, 200, {
          ok: true,
          dryRun: false,
          deleted: result.file,
          trashed: result.trashed,
          mediaDeleted: result.mediaDeleted,
          mediaTrashed: result.mediaTrashed,
          mediaDeleteFailed: result.mediaDeleteFailed,
          mediaKept: result.mediaKept,
          commit: result.commit,
          recoverable: true,
        });
      } catch (error) {
        logAdminError("content_delete", req, error, 500);
        return json(res, 500, {
          error: error instanceof Error ? error.message : "Error interno.",
        });
      }
    }

    // POST y PUT
    let raw: string;
    try {
      raw =
        typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body ?? {});
    } catch {
      return json(res, 400, { error: "La solicitud no es válida." });
    }
    if (raw.length > 300_000) {
      return json(res, 413, {
        error: "La solicitud supera el tamaño permitido.",
      });
    }

    let input: unknown;
    try {
      input = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return json(res, 400, {
        error: "El cuerpo de la solicitud no contiene JSON válido.",
      });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return json(res, 400, { error: "La solicitud no es válida." });
    }
    const data = input as {
      collection?: unknown;
      slug?: unknown;
      fields?: unknown;
      body?: unknown;
      sha?: unknown;
      action?: unknown;
    };
    const collection = data.collection;
    const slug = data.slug;

    if (req.method === "POST" && data.action === "restore") {
      if (typeof collection !== "string" || !collections.has(collection)) {
        return json(res, 400, { error: "Colección desconocida." });
      }
      if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160 || typeof data.sha !== "string") {
        return json(res, 400, { error: "La publicación de la papelera no es válida." });
      }
      try {
        const trashed = await readEntryBySlug(collection, `.deleted/${slug}`);
        if (trashed.sha !== data.sha) {
          return json(res, 409, { error: "La publicación de la papelera cambió. Recargá antes de restaurar." });
        }
        const originalSlug = trashed.fields.deletedSlug;
        if (typeof originalSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(originalSlug)) {
          return json(res, 400, { error: "No se pudo identificar el nombre original de la publicación." });
        }
        if (await findEntryBySlug(collection, originalSlug)) {
          return json(res, 409, { error: "Ya existe una publicación con ese nombre. Renombrala o eliminá la versión actual antes de restaurar." });
        }
        const fields = { ...trashed.fields };
        for (const key of ["deleted", "deletedAt", "deletedReason", "deletedSlug", "deletedCollection", "deletedBy"]) delete fields[key];
        const saved = await writeMarkdownFile(collection, originalSlug, fields, trashed.body);
        try {
          await deleteMarkdownFile(collection, `.deleted/${slug}`, trashed.sha);
        } catch (error) {
          logAdminError("content_restore_cleanup", req, error, 502);
          invalidateTreeCache();
          return json(res, 200, { ok: true, slug: originalSlug, commit: saved.commit, warning: "La publicación se restauró, pero quedó una copia en la papelera." });
        }
        invalidateTreeCache();
        return json(res, 200, { ok: true, slug: originalSlug, commit: saved.commit });
      } catch (error) {
        logAdminError("content_restore", req, error, 500);
        return json(res, 500, { error: error instanceof Error ? error.message : "No se pudo restaurar la publicación." });
      }
    }

    if (typeof collection !== "string" || !collections.has(collection)) {
      return json(res, 400, { error: "Colección desconocida." });
    }
    if (typeof slug !== "string" || slug.length > 80) {
      return json(res, 400, { error: "El slug no es válido." });
    }
    if (
      !data?.fields ||
      typeof data.fields !== "object" ||
      Array.isArray(data.fields)
    ) {
      return json(res, 400, {
        error: "Los campos del artículo no son válidos.",
      });
    }
    if (typeof data.body !== "string") {
      return json(res, 400, { error: "El cuerpo del artículo no es válido." });
    }

    const fields = data.fields as Record<string, unknown>;
    const invalid = validate(collection, fields, data.body);
    if (invalid) return json(res, 400, { error: invalid });

    if (collection === "reviews" || collection === "guides") {
      const game = fields.game;
      if (typeof game === "string" && game) {
        // Verificar que el juego existe
        try {
          await readEntryBySlug("games", game);
        } catch {
          return json(res, 400, {
            error: `No existe una ficha con el slug "${game}".`,
          });
        }
      }
    }

    const existingEntry = await findEntryBySlug(collection, slug);

    if (req.method === "POST" && existingEntry) {
      return json(res, 409, {
        error:
          "Ese slug ya existe. Elegí otro o abrí la publicación para editarla.",
      });
    }
    if (
      req.method === "PUT" &&
      (!existingEntry ||
        typeof data.sha !== "string" ||
        existingEntry.sha !== data.sha)
    ) {
      return json(res, 409, {
        error:
          "La publicación cambió en GitHub. Recargá antes de guardar para evitar pisar cambios ajenos.",
      });
    }

    try {
      const saved = await writeMarkdownFile(
        collection,
        slug,
        fields,
        data.body,
        existingEntry?.sha,
      );
      return json(res, 200, {
        ok: true,
        commit: saved.commit,
        slug,
        page: existingEntry?.page ?? 1,
      });
    } catch (error) {
      logAdminError("content_save", req, error, 500);
      return json(res, 500, {
        error: error instanceof Error ? error.message : "Error interno.",
      });
    }
  } catch (error) {
    return responseError(res, error, req);
  }
}

function responseError(
  res: AdminResponse,
  error: unknown,
  req: AdminRequest,
): void {
  logAdminError("content_api_error", req, error, 500);
  return json(res, 500, { error: "Error interno del servidor." });
}
