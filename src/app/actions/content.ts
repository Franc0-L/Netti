"use server";
import { updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/index.js";
import { articleRevisions, articles, media, redirects } from "@/db/schema.js";
import { assertSameOrigin, requireSession } from "@/lib/auth.js";
import { failure, type ActionResult, zodFieldErrors } from "@/lib/action-result.js";
import { affectedTags, type ArticleTagState } from "@/lib/tags.js";
import { articlePath } from "@/lib/routes.js";
import { makeArticleSchema } from "@/lib/validation.js";

type ArticleRow = typeof articles.$inferSelect;
type ArticleKind = "review" | "news" | "guide";
function originOf(h: Headers): string | undefined { const origin = h.get("origin"); if (origin) return origin; const referer = h.get("referer"); try { return referer ? new URL(referer).origin : undefined; } catch { return undefined; } }
async function authorize(): Promise<ActionResult<never> | null> {
  try { const h = await headers(); assertSameOrigin(originOf(h)); await requireSession(); return null; }
  catch (error) { const message = error instanceof Error ? error.message : ""; return message.includes("Origen") ? failure("forbidden", "Origen no permitido.") : failure("unauthorized", "Necesitás iniciar sesión."); }
}
function tagState(row: ArticleRow): ArticleTagState { return { id: row.id, kind: row.kind as ArticleKind, slug: row.slug, status: row.status as ArticleTagState["status"], publishedAt: row.publishedAt, featured: row.featured, tags: row.tags, title: row.title, description: row.description, coverMediaId: row.coverMediaId, gameId: row.gameId, score: row.score }; }
function validationFailure(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ActionResult<never> { return failure("invalid", "Revisá los campos del artículo.", { fieldErrors: zodFieldErrors(error) }); }
function prepareInput(input: unknown): unknown { if (!input || typeof input !== "object") return input; const value = input as Record<string, unknown>; return value.status === "published" && !value.publishedAt ? { ...value, publishedAt: new Date().toISOString() } : value; }
async function mediaReferencesValid(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], input: { coverMediaId?: number | null; ogMediaId?: number | null; body?: string }): Promise<boolean> {
  const ids = new Set<number>(); if (input.coverMediaId) ids.add(input.coverMediaId); if (input.ogMediaId) ids.add(input.ogMediaId);
  for (const match of input.body?.matchAll(/media:(\d+)(?!\d)/g) ?? []) ids.add(Number(match[1]));
  for (const id of ids) { const [row] = await tx.select({ id: media.id, pendingDeleteAt: media.pendingDeleteAt }).from(media).where(eq(media.id, id)).limit(1); if (!row || row.pendingDeleteAt !== null) return false; }
  return true;
}

export async function createArticle(input: unknown): Promise<ActionResult<{ id: number; version: number; slug: string }>> {
  const auth = await authorize(); if (auth) return auth as ActionResult<{ id: number; version: number; slug: string }>;
  const parsed = makeArticleSchema().safeParse(prepareInput(input)); if (!parsed.success) return validationFailure(parsed.error);
  const value = parsed.data;
  try {
    const row = await db.transaction(async (tx) => {
      if (!(await mediaReferencesValid(tx, value))) throw new Error("INVALID_MEDIA_REFERENCE");
      const [created] = await tx.insert(articles).values({
        kind: value.kind, slug: value.slug, title: value.title, description: value.description, body: value.body,
        author: value.author ?? null, tags: value.tags, coverMediaId: value.coverMediaId ?? null, coverAlt: value.coverAlt ?? null,
        status: value.status, publishedAt: value.publishedAt ?? null, featured: value.featured,
        seoTitle: value.seoTitle ?? null, seoDescription: value.seoDescription ?? null, ogMediaId: value.ogMediaId ?? null,
        gameId: value.kind === "review" ? value.gameId ?? null : null, score: value.kind === "review" ? value.score ?? null : null,
        scoreReason: value.kind === "review" ? value.scoreReason ?? null : null, verdict: value.kind === "review" ? value.verdict ?? null : null,
        category: value.kind === "news" ? value.category ?? null : null, sourceName: value.kind === "news" ? value.sourceName ?? null : null,
        sourceUrl: value.kind === "news" ? value.sourceUrl ?? null : null,
      }).returning();
      if (!created) throw new Error("ARTICLE_INSERT_FAILED");
      await tx.insert(articleRevisions).values({ articleId: created.id, version: created.version, snapshot: JSON.stringify(created) });
      return created;
    });
    for (const tag of affectedTags(null, tagState(row))) updateTag(tag);
    return { ok: true, data: { id: row.id, version: row.version, slug: row.slug } };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.message === "INVALID_MEDIA_REFERENCE") return failure("conflict", "Hay una imagen inexistente o marcada para eliminación.");
    if (e.code === "23505") return failure("conflict", "El slug ya está en uso.", { fieldErrors: { slug: ["El slug ya está en uso."] } });
    return failure("server", "No se pudo crear el artículo.");
  }
}

export async function updateArticle(args: { id: number; version: number; input: unknown }): Promise<ActionResult<{ version: number; slug: string; status: string; oldSlug?: string }>> {
  const auth = await authorize(); if (auth) return auth as ActionResult<{ version: number; slug: string; status: string; oldSlug?: string }>;
  if (!Number.isSafeInteger(args?.id) || args.id < 1 || !Number.isSafeInteger(args?.version) || args.version < 1) return failure("invalid", "Identificador o versión inválidos.");
  const parsed = makeArticleSchema().safeParse(prepareInput(args.input)); if (!parsed.success) return validationFailure(parsed.error);
  const value = parsed.data;
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(articles).where(eq(articles.id, args.id)).limit(1).for("update");
      if (!before) return { type: "missing" as const };
      if (before.version !== args.version) return { type: "stale" as const, current: { version: before.version, slug: before.slug, title: before.title, status: before.status } };
      if (before.kind !== value.kind || before.status !== value.status) return { type: "state" as const };
      if (!(await mediaReferencesValid(tx, value))) return { type: "media" as const };
      if (before.slug !== value.slug && before.status === "published") {
        const oldPath = articlePath(before.kind as ArticleKind, before.slug);
        const newPath = articlePath(before.kind as ArticleKind, value.slug);
        await tx.delete(redirects).where(eq(redirects.fromPath, newPath));
        await tx.delete(redirects).where(eq(redirects.fromPath, oldPath));
        await tx.insert(redirects).values({ fromPath: oldPath, toPath: newPath, statusCode: 308 });
      }
      const [updated] = await tx.update(articles).set({
        slug: value.slug, title: value.title, description: value.description, body: value.body, author: value.author ?? null,
        tags: value.tags, coverMediaId: value.coverMediaId ?? null, coverAlt: value.coverAlt ?? null,
        publishedAt: value.publishedAt ?? null, featured: value.featured, seoTitle: value.seoTitle ?? null,
        seoDescription: value.seoDescription ?? null, ogMediaId: value.ogMediaId ?? null,
        gameId: value.kind === "review" ? value.gameId ?? null : null, score: value.kind === "review" ? value.score ?? null : null,
        scoreReason: value.kind === "review" ? value.scoreReason ?? null : null, verdict: value.kind === "review" ? value.verdict ?? null : null,
        category: value.kind === "news" ? value.category ?? null : null, sourceName: value.kind === "news" ? value.sourceName ?? null : null,
        sourceUrl: value.kind === "news" ? value.sourceUrl ?? null : null,
      }).where(and(eq(articles.id, args.id), eq(articles.version, args.version))).returning();
      if (!updated) return { type: "stale" as const, current: null };
      if (updated.version !== before.version) await tx.insert(articleRevisions).values({ articleId: updated.id, version: updated.version, snapshot: JSON.stringify(updated) });
      return { type: "ok" as const, before, updated };
    });
    if (outcome.type === "missing") return failure("not_found", "El artículo no existe.");
    if (outcome.type === "stale") return failure("conflict", "El artículo cambió desde que lo abriste. Recargá antes de guardar.", { current: outcome.current });
    if (outcome.type === "state") return failure("conflict", "No se puede cambiar el tipo o estado desde guardar.");
    if (outcome.type === "media") return failure("conflict", "Hay una imagen inexistente o marcada para eliminación.");
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated))) updateTag(tag);
    return { ok: true, data: { version: outcome.updated.version, slug: outcome.updated.slug, status: outcome.updated.status, ...(outcome.before.slug !== outcome.updated.slug ? { oldSlug: outcome.before.slug } : {}) } };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return failure("conflict", "El slug ya está en uso.", { fieldErrors: { slug: ["El slug ya está en uso."] } });
    return failure("server", "No se pudo actualizar el artículo.");
  }
}

export async function publishArticle(args: { id: number; version: number }): Promise<ActionResult<{ version: number; slug: string; status: "published" }>> {
  const auth = await authorize(); if (auth) return auth as ActionResult<{ version: number; slug: string; status: "published" }>;
  if (!Number.isSafeInteger(args?.id) || args.id < 1 || !Number.isSafeInteger(args?.version) || args.version < 1) return failure("invalid", "Identificador o versión inválidos.");
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(articles).where(eq(articles.id, args.id)).limit(1).for("update");
      if (!before) return { type: "missing" as const };
      if (before.version !== args.version) return { type: "stale" as const };
      if (before.status !== "draft" && before.status !== "published") return { type: "state" as const };
      const candidate = { ...before, status: "published", publishedAt: before.publishedAt?.toISOString() ?? new Date().toISOString() };
      const parsed = makeArticleSchema().safeParse(candidate);
      if (!parsed.success) return { type: "invalid" as const, fields: zodFieldErrors(parsed.error) };
      if (!(await mediaReferencesValid(tx, parsed.data))) return { type: "media" as const };
      const [updated] = await tx.update(articles).set({ status: "published", publishedAt: before.publishedAt ?? new Date() }).where(and(eq(articles.id, args.id), eq(articles.version, args.version))).returning();
      if (!updated) return { type: "stale" as const };
      await tx.insert(articleRevisions).values({ articleId: updated.id, version: updated.version, snapshot: JSON.stringify(updated) });
      return { type: "ok" as const, before, updated };
    });
    if (outcome.type === "missing") return failure("not_found", "El artículo no existe.");
    if (outcome.type === "stale") return failure("conflict", "El artículo cambió desde que lo abriste.");
    if (outcome.type === "state") return failure("conflict", "No se puede publicar un artículo en la papelera.");
    if (outcome.type === "invalid") return failure("invalid", "El artículo todavía no está completo para publicar.", { fieldErrors: outcome.fields });
    if (outcome.type === "media") return failure("conflict", "Hay una imagen inexistente o marcada para eliminación.");
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated))) updateTag(tag);
    return { ok: true, data: { version: outcome.updated.version, slug: outcome.updated.slug, status: "published" } };
  } catch { return failure("server", "No se pudo publicar el artículo."); }
}
