'use server';
import { updateTag } from 'next/cache';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { db, type Tx } from '@/db/index';
import { articleGallery, articleRevisions, articles, games, media, redirects } from '@/db/schema';
import { failure, zodFieldErrors, type ActionResult } from '@/lib/action-result';
import { affectedTags, type ArticleTagState } from '@/lib/tags';
import { articlePath } from '@/lib/routes';
import { logger } from '@/lib/logger';
import { REVISION_RETENTION } from '@/lib/revisions';
import { makeArticleSchema } from '@/lib/validation';
import { authorize, validId, validationFailure } from './_shared';

type ArticleRow = typeof articles.$inferSelect;
type ArticleKind = 'review' | 'news' | 'guide';

function tagState(row: ArticleRow): ArticleTagState {
  return {
    id: row.id,
    kind: row.kind as ArticleKind,
    slug: row.slug,
    status: row.status as ArticleTagState['status'],
    publishedAt: row.publishedAt,
    featured: row.featured,
    tags: row.tags,
    title: row.title,
    description: row.description,
    coverMediaId: row.coverMediaId,
    gameId: row.gameId,
    score: row.score,
  };
}

function prepareInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const value = input as Record<string, unknown>;
  return value.status === 'published' && !value.publishedAt
    ? { ...value, publishedAt: new Date().toISOString() }
    : value;
}

/**
 * Resolves every media reference of an article in one round trip.
 *
 * Covers the cover, the social image, the structured gallery and the
 * `media:<id>` references of the body. A reference to a missing image, or to
 * one already marked for deletion, invalidates the whole save.
 */
async function resolveMediaReferences(
  tx: Tx,
  input: {
    coverMediaId?: number | null;
    ogMediaId?: number | null;
    body?: string;
    gallery?: number[];
  }
): Promise<{
  valid: boolean;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
}> {
  const ids = new Set<number>();
  if (input.coverMediaId) ids.add(input.coverMediaId);
  if (input.ogMediaId) ids.add(input.ogMediaId);
  for (const id of input.gallery ?? []) ids.add(id);
  for (const match of input.body?.matchAll(/media:(\d+)(?!\d)/g) ?? []) ids.add(Number(match[1]));

  const found = new Map<number, { publicUrl: string; pendingDeleteAt: Date | null }>();
  if (ids.size > 0) {
    // One round trip for every reference, instead of one query per identifier.
    const rows = await tx
      .select({
        id: media.id,
        publicUrl: media.publicUrl,
        pendingDeleteAt: media.pendingDeleteAt,
      })
      .from(media)
      .where(inArray(media.id, Array.from(ids)));
    if (rows.length !== ids.size) return { valid: false, coverImageUrl: null, ogImageUrl: null };
    for (const row of rows) {
      if (row.pendingDeleteAt !== null)
        return { valid: false, coverImageUrl: null, ogImageUrl: null };
      found.set(row.id, { publicUrl: row.publicUrl, pendingDeleteAt: row.pendingDeleteAt });
    }
  }
  if (input.body) {
    for (const match of input.body.matchAll(/media:(\d+)(?!\d)/g)) {
      if (!found.has(Number(match[1])))
        return { valid: false, coverImageUrl: null, ogImageUrl: null };
    }
  }
  return {
    valid: true,
    coverImageUrl: input.coverMediaId ? (found.get(input.coverMediaId)?.publicUrl ?? null) : null,
    ogImageUrl: input.ogMediaId ? (found.get(input.ogMediaId)?.publicUrl ?? null) : null,
  };
}

async function reviewGameIsPublished(
  tx: Tx,
  kind: string,
  gameId: number | null | undefined,
  status: string
): Promise<boolean> {
  if (kind !== 'review' || status !== 'published') return true;
  if (!gameId) return false;
  const [game] = await tx
    .select({ status: games.status })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  return game?.status === 'published';
}

/** Replaces the structured gallery of an article with the given images. */
async function syncGallery(tx: Tx, articleId: number, mediaIds: number[]): Promise<void> {
  await tx.delete(articleGallery).where(eq(articleGallery.articleId, articleId));
  if (mediaIds.length === 0) return;
  await tx.insert(articleGallery).values(
    mediaIds.map((mediaId, position) => ({
      articleId,
      mediaId,
      position,
    }))
  );
}

/**
 * Keeps the revision history bounded.
 *
 * Every save creates a new version through the database trigger, so the table
 * would grow without limit. Only the newest {@link REVISION_RETENTION}
 * snapshots are kept: they are enough to review or undo a recent change.
 */
async function pruneRevisions(tx: Tx, articleId: number): Promise<void> {
  const keep = await tx
    .select({ id: articleRevisions.id })
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(desc(articleRevisions.version))
    .limit(REVISION_RETENTION + 1);
  if (keep.length <= REVISION_RETENTION) return;

  const keepIds = keep.slice(0, REVISION_RETENTION).map((row) => row.id);
  await tx
    .delete(articleRevisions)
    .where(
      and(eq(articleRevisions.articleId, articleId), notInArray(articleRevisions.id, keepIds))
    );
}

/** Records a snapshot of the current state of the article. */
async function recordRevision(tx: Tx, row: ArticleRow): Promise<void> {
  await tx.insert(articleRevisions).values({
    articleId: row.id,
    version: row.version,
    snapshot: JSON.stringify(row),
  });
  await pruneRevisions(tx, row.id);
}

/** Shared error mapping of the editorial writes. */
function writeFailure(
  error: unknown,
  event: string,
  context: Record<string, unknown>,
  message: string
): ActionResult<never> {
  const code = (error as { code?: string }).code;
  if (code === '23505') {
    return failure('conflict', 'El slug ya está en uso.', {
      fieldErrors: { slug: ['El slug ya está en uso.'] },
    });
  }
  logger.error(event, {
    ...context,
    errorType: error instanceof Error ? error.name : 'unknown',
    errorCode: code ?? 'unknown',
  });
  return failure('server', message);
}

export async function createArticle(
  input: unknown
): Promise<ActionResult<{ id: number; version: number; slug: string }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ id: number; version: number; slug: string }>;
  const parsed = makeArticleSchema().safeParse(prepareInput(input));
  if (!parsed.success) return validationFailure(parsed.error, 'Revisá los campos del artículo.');
  const value = parsed.data;
  try {
    const row = await db.transaction(async (tx) => {
      const resolvedMedia = await resolveMediaReferences(tx, value);
      if (!resolvedMedia.valid) throw new Error('INVALID_MEDIA_REFERENCE');
      if (
        !(await reviewGameIsPublished(
          tx,
          value.kind,
          value.kind === 'review' ? value.gameId : null,
          value.status
        ))
      )
        throw new Error('INVALID_GAME_REFERENCE');
      const [created] = await tx
        .insert(articles)
        .values({
          kind: value.kind,
          slug: value.slug,
          title: value.title,
          description: value.description,
          body: value.body,
          author: value.author ?? null,
          tags: value.tags,
          coverMediaId: value.coverMediaId ?? null,
          coverImageUrl: resolvedMedia.coverImageUrl,
          coverAlt: value.coverAlt ?? null,
          status: value.status,
          publishedAt: value.publishedAt ?? null,
          featured: value.featured,
          seoTitle: value.seoTitle ?? null,
          seoDescription: value.seoDescription ?? null,
          ogMediaId: value.ogMediaId ?? null,
          ogImageUrl: resolvedMedia.ogImageUrl,
          pros: value.pros,
          cons: value.cons,
          videoUrl: value.videoUrl ?? null,
          videoTitle: value.videoTitle ?? null,
          gameId: value.kind === 'review' ? (value.gameId ?? null) : null,
          score: value.kind === 'review' ? (value.score ?? null) : null,
          scoreDetails: value.kind === 'review' ? (value.scoreDetails ?? null) : null,
          scoreReason: value.kind === 'review' ? (value.scoreReason ?? null) : null,
          verdict: value.kind === 'review' ? (value.verdict ?? null) : null,
          category: value.kind === 'news' ? (value.category ?? null) : null,
          sourceName: value.kind === 'news' ? (value.sourceName ?? null) : null,
          sourceUrl: value.kind === 'news' ? (value.sourceUrl ?? null) : null,
        })
        .returning();
      if (!created) throw new Error('ARTICLE_INSERT_FAILED');
      await syncGallery(tx, created.id, value.gallery);
      await recordRevision(tx, created);
      return created;
    });
    for (const tag of affectedTags(null, tagState(row))) updateTag(tag);
    logger.info('content.create.succeeded', { articleId: row.id, kind: row.kind });
    return { ok: true, data: { id: row.id, version: row.version, slug: row.slug } };
  } catch (error) {
    const message = (error as { message?: string }).message;
    if (message === 'INVALID_MEDIA_REFERENCE')
      return failure('conflict', 'Hay una imagen inexistente o marcada para eliminación.');
    if (message === 'INVALID_GAME_REFERENCE')
      return failure('conflict', 'Una reseña publicada debe enlazar un juego publicado.', {
        fieldErrors: { gameId: ['Elegí un juego publicado.'] },
      });
    return writeFailure(error, 'content.create.failed', {}, 'No se pudo crear el artículo.');
  }
}

export async function updateArticle(args: {
  id: number;
  version: number;
  input: unknown;
}): Promise<ActionResult<{ version: number; slug: string; status: string; oldSlug?: string }>> {
  const auth = await authorize();
  if (auth)
    return auth as ActionResult<{
      version: number;
      slug: string;
      status: string;
      oldSlug?: string;
    }>;
  if (!validId(args?.id) || !validId(args?.version))
    return failure('invalid', 'Identificador o versión inválidos.');
  const parsed = makeArticleSchema().safeParse(prepareInput(args.input));
  if (!parsed.success) return validationFailure(parsed.error, 'Revisá los campos del artículo.');
  const value = parsed.data;
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(eq(articles.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.version !== args.version)
        return {
          type: 'stale' as const,
          current: {
            version: before.version,
            slug: before.slug,
            title: before.title,
            status: before.status,
          },
        };
      if (before.kind !== value.kind || before.status !== value.status)
        return { type: 'state' as const };
      const resolvedMedia = await resolveMediaReferences(tx, value);
      if (!resolvedMedia.valid) return { type: 'media' as const };
      if (
        !(await reviewGameIsPublished(
          tx,
          value.kind,
          value.kind === 'review' ? value.gameId : null,
          value.status
        ))
      )
        return { type: 'game' as const };
      if (before.slug !== value.slug && before.status === 'published') {
        const oldPath = articlePath(before.kind as ArticleKind, before.slug);
        const newPath = articlePath(before.kind as ArticleKind, value.slug);
        await tx.delete(redirects).where(eq(redirects.fromPath, newPath));
        await tx.delete(redirects).where(eq(redirects.fromPath, oldPath));
        await tx.insert(redirects).values({ fromPath: oldPath, toPath: newPath, statusCode: 308 });
      }
      const [updated] = await tx
        .update(articles)
        .set({
          slug: value.slug,
          title: value.title,
          description: value.description,
          body: value.body,
          author: value.author ?? null,
          tags: value.tags,
          coverMediaId: value.coverMediaId ?? null,
          coverImageUrl: resolvedMedia.coverImageUrl,
          coverAlt: value.coverAlt ?? null,
          publishedAt: value.publishedAt ?? null,
          featured: value.featured,
          seoTitle: value.seoTitle ?? null,
          seoDescription: value.seoDescription ?? null,
          ogMediaId: value.ogMediaId ?? null,
          ogImageUrl: resolvedMedia.ogImageUrl,
          pros: value.pros,
          cons: value.cons,
          videoUrl: value.videoUrl ?? null,
          videoTitle: value.videoTitle ?? null,
          gameId: value.kind === 'review' ? (value.gameId ?? null) : null,
          score: value.kind === 'review' ? (value.score ?? null) : null,
          scoreDetails: value.kind === 'review' ? (value.scoreDetails ?? null) : null,
          scoreReason: value.kind === 'review' ? (value.scoreReason ?? null) : null,
          verdict: value.kind === 'review' ? (value.verdict ?? null) : null,
          category: value.kind === 'news' ? (value.category ?? null) : null,
          sourceName: value.kind === 'news' ? (value.sourceName ?? null) : null,
          sourceUrl: value.kind === 'news' ? (value.sourceUrl ?? null) : null,
        })
        .where(and(eq(articles.id, args.id), eq(articles.version, args.version)))
        .returning();
      if (!updated) return { type: 'stale' as const, current: null };
      await syncGallery(tx, updated.id, value.gallery);
      if (updated.version !== before.version) await recordRevision(tx, updated);
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El artículo no existe.');
    if (outcome.type === 'stale')
      return failure(
        'conflict',
        'El artículo cambió desde que lo abriste. Recargá antes de guardar.',
        { current: outcome.current }
      );
    if (outcome.type === 'state')
      return failure('conflict', 'No se puede cambiar el tipo o estado desde guardar.');
    if (outcome.type === 'media')
      return failure('conflict', 'Hay una imagen inexistente o marcada para eliminación.');
    if (outcome.type === 'game')
      return failure('conflict', 'Una reseña publicada debe enlazar un juego publicado.', {
        fieldErrors: { gameId: ['Elegí un juego publicado.'] },
      });
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated)))
      updateTag(tag);
    if (outcome.before.slug !== outcome.updated.slug) updateTag('redirects');
    logger.info('content.update.succeeded', {
      articleId: outcome.updated.id,
      kind: outcome.updated.kind,
      slugChanged: outcome.before.slug !== outcome.updated.slug,
    });
    return {
      ok: true,
      data: {
        version: outcome.updated.version,
        slug: outcome.updated.slug,
        status: outcome.updated.status,
        ...(outcome.before.slug !== outcome.updated.slug ? { oldSlug: outcome.before.slug } : {}),
      },
    };
  } catch (error) {
    return writeFailure(
      error,
      'content.update.failed',
      { articleId: args.id },
      'No se pudo actualizar el artículo.'
    );
  }
}

export async function publishArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number; slug: string; status: 'published' }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ version: number; slug: string; status: 'published' }>;
  if (!validId(args?.id) || !validId(args?.version))
    return failure('invalid', 'Identificador o versión inválidos.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(eq(articles.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.version !== args.version) return { type: 'stale' as const };
      if (before.status !== 'draft') return { type: 'state' as const };
      const gallery = await tx
        .select({ mediaId: articleGallery.mediaId })
        .from(articleGallery)
        .where(eq(articleGallery.articleId, before.id))
        .orderBy(articleGallery.position);
      const candidate = {
        ...before,
        pros: before.pros,
        cons: before.cons,
        gallery: gallery.map((row) => row.mediaId),
        status: 'published',
        publishedAt: before.publishedAt?.toISOString() ?? new Date().toISOString(),
      };
      const parsed = makeArticleSchema().safeParse(candidate);
      if (!parsed.success)
        return { type: 'invalid' as const, fields: zodFieldErrors(parsed.error) };
      const resolvedMedia = await resolveMediaReferences(tx, parsed.data);
      if (!resolvedMedia.valid) return { type: 'media' as const };
      if (
        !(await reviewGameIsPublished(
          tx,
          parsed.data.kind,
          parsed.data.kind === 'review' ? parsed.data.gameId : null,
          'published'
        ))
      )
        return { type: 'game' as const };
      const [updated] = await tx
        .update(articles)
        .set({
          status: 'published',
          publishedAt: before.publishedAt ?? new Date(),
          coverImageUrl: resolvedMedia.coverImageUrl,
          ogImageUrl: resolvedMedia.ogImageUrl,
        })
        .where(and(eq(articles.id, args.id), eq(articles.version, args.version)))
        .returning();
      if (!updated) return { type: 'stale' as const };
      await recordRevision(tx, updated);
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El artículo no existe.');
    if (outcome.type === 'stale')
      return failure('conflict', 'El artículo cambió desde que lo abriste.');
    if (outcome.type === 'state')
      return failure('conflict', 'No se puede publicar un artículo en la papelera.');
    if (outcome.type === 'invalid')
      return failure('invalid', 'El artículo todavía no está completo para publicar.', {
        fieldErrors: outcome.fields,
      });
    if (outcome.type === 'media')
      return failure('conflict', 'Hay una imagen inexistente o marcada para eliminación.');
    if (outcome.type === 'game')
      return failure('conflict', 'Una reseña publicada debe enlazar un juego publicado.', {
        fieldErrors: { gameId: ['Elegí un juego publicado.'] },
      });
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated)))
      updateTag(tag);
    logger.info('content.publish.succeeded', {
      articleId: outcome.updated.id,
      kind: outcome.updated.kind,
    });
    return {
      ok: true,
      data: { version: outcome.updated.version, slug: outcome.updated.slug, status: 'published' },
    };
  } catch (error) {
    return writeFailure(
      error,
      'content.publish.failed',
      { articleId: args.id },
      'No se pudo publicar el artículo.'
    );
  }
}

/**
 * Moves a published article back to draft.
 *
 * It is a separate action because the form cannot change the status: the
 * article keeps its publication date, so re-publishing restores the original
 * order in the collection.
 */
export async function unpublishArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number; status: 'draft' }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ version: number; status: 'draft' }>;
  if (!validId(args?.id) || !validId(args?.version))
    return failure('invalid', 'Identificador o versión inválidos.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(eq(articles.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.version !== args.version) return { type: 'stale' as const };
      if (before.status !== 'published') return { type: 'state' as const };
      const [updated] = await tx
        .update(articles)
        .set({ status: 'draft' })
        .where(and(eq(articles.id, args.id), eq(articles.version, args.version)))
        .returning();
      if (!updated) return { type: 'stale' as const };
      await recordRevision(tx, updated);
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El artículo no existe.');
    if (outcome.type === 'stale')
      return failure('conflict', 'El artículo cambió desde que lo abriste.');
    if (outcome.type === 'state')
      return failure('conflict', 'Solo se puede despublicar un artículo publicado.');
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated)))
      updateTag(tag);
    logger.info('content.unpublish.succeeded', { articleId: outcome.updated.id });
    return { ok: true, data: { version: outcome.updated.version, status: 'draft' } };
  } catch (error) {
    return writeFailure(
      error,
      'content.unpublish.failed',
      { articleId: args.id },
      'No se pudo despublicar el artículo.'
    );
  }
}

/** Moves an article to the trash, remembering its previous state. */
export async function trashArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ version: number }>;
  if (!validId(args?.id) || !validId(args?.version))
    return failure('invalid', 'Identificador o versión inválidos.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(eq(articles.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.version !== args.version) return { type: 'stale' as const };
      if (before.status === 'trashed') return { type: 'state' as const };
      const [updated] = await tx
        .update(articles)
        .set({
          status: 'trashed',
          previousStatus: before.status,
          trashedAt: new Date(),
        })
        .where(and(eq(articles.id, args.id), eq(articles.version, args.version)))
        .returning();
      if (!updated) return { type: 'stale' as const };
      await recordRevision(tx, updated);
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El artículo no existe.');
    if (outcome.type === 'stale')
      return failure('conflict', 'El artículo cambió desde que lo abriste.');
    if (outcome.type === 'state') return failure('conflict', 'El artículo ya está en la papelera.');
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated)))
      updateTag(tag);
    logger.info('content.trash.succeeded', { articleId: outcome.updated.id });
    return { ok: true, data: { version: outcome.updated.version } };
  } catch (error) {
    return writeFailure(
      error,
      'content.trash.failed',
      { articleId: args.id },
      'No se pudo mover el artículo a la papelera.'
    );
  }
}

/** Restores an article from the trash to the state it had before. */
export async function restoreArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number; status: 'draft' | 'published' }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ version: number; status: 'draft' | 'published' }>;
  if (!validId(args?.id) || !validId(args?.version))
    return failure('invalid', 'Identificador o versión inválidos.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(eq(articles.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.version !== args.version) return { type: 'stale' as const };
      if (before.status !== 'trashed') return { type: 'state' as const };
      const status = before.previousStatus === 'published' ? 'published' : 'draft';
      const [updated] = await tx
        .update(articles)
        .set({ status, previousStatus: null, trashedAt: null })
        .where(and(eq(articles.id, args.id), eq(articles.version, args.version)))
        .returning();
      if (!updated) return { type: 'stale' as const };
      await recordRevision(tx, updated);
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El artículo no existe.');
    if (outcome.type === 'stale')
      return failure('conflict', 'El artículo cambió desde que lo abriste.');
    if (outcome.type === 'state')
      return failure('conflict', 'Solo se puede restaurar un artículo de la papelera.');
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated)))
      updateTag(tag);
    logger.info('content.restore.succeeded', { articleId: outcome.updated.id });
    return {
      ok: true,
      data: {
        version: outcome.updated.version,
        status: outcome.updated.status as 'draft' | 'published',
      },
    };
  } catch (error) {
    return writeFailure(
      error,
      'content.restore.failed',
      { articleId: args.id },
      'No se pudo restaurar el artículo.'
    );
  }
}

/**
 * Restores the content of an old revision.
 *
 * The snapshot is applied as a new version, so nothing is lost: the history
 * keeps both the restored state and the state it replaced. The editorial
 * status, the publication date and the featured flag are not touched, because
 * undoing a text change must not publish or unpublish anything.
 */
export async function restoreRevision(args: {
  articleId: number;
  revisionId: number;
}): Promise<ActionResult<{ version: number; slug: string }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ version: number; slug: string }>;
  if (!validId(args?.articleId) || !validId(args?.revisionId))
    return failure('invalid', 'Identificador de revisión inválido.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(eq(articles.id, args.articleId))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      const [revision] = await tx
        .select({ snapshot: articleRevisions.snapshot })
        .from(articleRevisions)
        .where(
          and(
            eq(articleRevisions.id, args.revisionId),
            eq(articleRevisions.articleId, args.articleId)
          )
        )
        .limit(1);
      if (!revision) return { type: 'missing' as const };

      let snapshot: Record<string, unknown>;
      try {
        snapshot = JSON.parse(revision.snapshot) as Record<string, unknown>;
      } catch {
        return { type: 'corrupt' as const };
      }

      const mediaIds = await tx
        .select({ mediaId: articleGallery.mediaId })
        .from(articleGallery)
        .where(eq(articleGallery.articleId, args.articleId));
      const candidate = {
        ...snapshot,
        // The gallery is restored from the snapshot when it is present.
        gallery: Array.isArray(snapshot.gallery)
          ? (snapshot.gallery as number[])
          : mediaIds.map((row) => row.mediaId),
        status: before.status === 'trashed' ? 'draft' : before.status,
        publishedAt: before.publishedAt?.toISOString() ?? null,
      };
      const parsed = makeArticleSchema().safeParse(candidate);
      if (!parsed.success)
        return { type: 'invalid' as const, fields: zodFieldErrors(parsed.error) };
      const resolvedMedia = await resolveMediaReferences(tx, parsed.data);
      if (!resolvedMedia.valid) return { type: 'media' as const };
      if (
        !(await reviewGameIsPublished(
          tx,
          parsed.data.kind,
          parsed.data.kind === 'review' ? parsed.data.gameId : null,
          before.status === 'published' ? 'published' : 'draft'
        ))
      )
        return { type: 'game' as const };

      if (before.slug !== parsed.data.slug && before.status === 'published') {
        const oldPath = articlePath(before.kind as ArticleKind, before.slug);
        const newPath = articlePath(before.kind as ArticleKind, parsed.data.slug);
        await tx.delete(redirects).where(eq(redirects.fromPath, newPath));
        await tx.delete(redirects).where(eq(redirects.fromPath, oldPath));
        await tx.insert(redirects).values({ fromPath: oldPath, toPath: newPath, statusCode: 308 });
      }

      const [updated] = await tx
        .update(articles)
        .set({
          slug: parsed.data.slug,
          title: parsed.data.title,
          description: parsed.data.description,
          body: parsed.data.body,
          author: parsed.data.author ?? null,
          tags: parsed.data.tags,
          coverMediaId: parsed.data.coverMediaId ?? null,
          coverImageUrl: resolvedMedia.coverImageUrl,
          coverAlt: parsed.data.coverAlt ?? null,
          seoTitle: parsed.data.seoTitle ?? null,
          seoDescription: parsed.data.seoDescription ?? null,
          ogMediaId: parsed.data.ogMediaId ?? null,
          ogImageUrl: resolvedMedia.ogImageUrl,
          pros: parsed.data.pros,
          cons: parsed.data.cons,
          videoUrl: parsed.data.videoUrl ?? null,
          videoTitle: parsed.data.videoTitle ?? null,
          gameId: parsed.data.kind === 'review' ? (parsed.data.gameId ?? null) : null,
          score: parsed.data.kind === 'review' ? (parsed.data.score ?? null) : null,
          scoreDetails: parsed.data.kind === 'review' ? (parsed.data.scoreDetails ?? null) : null,
          scoreReason: parsed.data.kind === 'review' ? (parsed.data.scoreReason ?? null) : null,
          verdict: parsed.data.kind === 'review' ? (parsed.data.verdict ?? null) : null,
          category: parsed.data.kind === 'news' ? (parsed.data.category ?? null) : null,
          sourceName: parsed.data.kind === 'news' ? (parsed.data.sourceName ?? null) : null,
          sourceUrl: parsed.data.kind === 'news' ? (parsed.data.sourceUrl ?? null) : null,
        })
        .where(eq(articles.id, args.articleId))
        .returning();
      if (!updated) return { type: 'missing' as const };
      await syncGallery(tx, updated.id, parsed.data.gallery);
      await recordRevision(tx, updated);
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'La revisión no existe.');
    if (outcome.type === 'corrupt')
      return failure('server', 'La revisión está dañada y no se puede restaurar.');
    if (outcome.type === 'invalid')
      return failure('invalid', 'La revisión no cumple las reglas actuales.', {
        fieldErrors: outcome.fields,
      });
    if (outcome.type === 'media')
      return failure('conflict', 'La revisión referencia una imagen que ya no existe.');
    if (outcome.type === 'game')
      return failure('conflict', 'La revisión enlaza un juego que ya no está publicado.');
    for (const tag of affectedTags(tagState(outcome.before), tagState(outcome.updated)))
      updateTag(tag);
    if (outcome.before.slug !== outcome.updated.slug) updateTag('redirects');
    logger.info('content.revision_restore.succeeded', {
      articleId: outcome.updated.id,
      version: outcome.updated.version,
    });
    return {
      ok: true,
      data: { version: outcome.updated.version, slug: outcome.updated.slug },
    };
  } catch (error) {
    return writeFailure(
      error,
      'content.revision_restore.failed',
      { articleId: args.articleId },
      'No se pudo restaurar la revisión.'
    );
  }
}
