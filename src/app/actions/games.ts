'use server';
import { updateTag } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { db, type Tx } from '@/db/index';
import { articles, games, media } from '@/db/schema';
import { failure, type ActionResult } from '@/lib/action-result';
import { logger } from '@/lib/logger';
import { makeGameSchema } from '@/lib/validation';
import { authorize, validId, validationFailure } from './_shared';

/** Invalidates the public catalog after a game changes. */
function invalidateGame(slug: string): void {
  updateTag('games');
  updateTag(`game:${slug}`);
  updateTag('home');
}

async function resolveCover(
  tx: Tx,
  coverMediaId: number | null | undefined
): Promise<{ valid: boolean; coverImageUrl: string | null }> {
  if (!coverMediaId) return { valid: true, coverImageUrl: null };
  const [row] = await tx
    .select({ publicUrl: media.publicUrl, pendingDeleteAt: media.pendingDeleteAt })
    .from(media)
    .where(inArray(media.id, [coverMediaId]))
    .limit(1);
  if (!row || row.pendingDeleteAt !== null) return { valid: false, coverImageUrl: null };
  return { valid: true, coverImageUrl: row.publicUrl };
}

/**
 * Reports whether a published review points to the game.
 *
 * A published review is only valid against a published game, so a game that
 * still has published reviews cannot be hidden or trashed: those reviews would
 * become orphaned on the public site.
 */
async function hasPublishedReviews(tx: Tx, gameId: number): Promise<boolean> {
  const [row] = await tx
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.gameId, gameId),
        eq(articles.kind, 'review'),
        eq(articles.status, 'published')
      )
    )
    .limit(1);
  return Boolean(row);
}

function writeFailure(error: unknown, event: string, message: string): ActionResult<never> {
  const code = (error as { code?: string }).code;
  if (code === '23505') {
    return failure('conflict', 'El slug ya está en uso.', {
      fieldErrors: { slug: ['El slug ya está en uso.'] },
    });
  }
  logger.error(event, {
    errorType: error instanceof Error ? error.name : 'unknown',
    errorCode: code ?? 'unknown',
  });
  return failure('server', message);
}

export async function createGame(
  input: unknown
): Promise<ActionResult<{ id: number; slug: string }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ id: number; slug: string }>;
  const parsed = makeGameSchema().safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error, 'Revisá los campos del juego.');
  const value = parsed.data;
  try {
    const created = await db.transaction(async (tx) => {
      const cover = await resolveCover(tx, value.coverMediaId);
      if (!cover.valid) throw new Error('INVALID_MEDIA_REFERENCE');
      const [row] = await tx
        .insert(games)
        .values({
          slug: value.slug,
          title: value.title,
          description: value.description,
          body: value.body,
          developer: value.developer ?? null,
          publisher: value.publisher ?? null,
          releaseDate: value.releaseDate ?? null,
          platforms: value.platforms,
          genres: value.genres,
          tags: value.tags,
          featured: value.featured,
          status: value.status,
          coverMediaId: value.coverMediaId ?? null,
          coverImageUrl: cover.coverImageUrl,
          coverAlt: value.coverAlt ?? null,
        })
        .returning();
      if (!row) throw new Error('GAME_INSERT_FAILED');
      return row;
    });
    invalidateGame(created.slug);
    logger.info('games.create.succeeded', { gameId: created.id });
    return { ok: true, data: { id: created.id, slug: created.slug } };
  } catch (error) {
    if ((error as { message?: string }).message === 'INVALID_MEDIA_REFERENCE')
      return failure('conflict', 'La portada no existe o está marcada para eliminación.', {
        fieldErrors: { coverMediaId: ['Elegí otra imagen.'] },
      });
    return writeFailure(error, 'games.create.failed', 'No se pudo crear el juego.');
  }
}

export async function updateGame(args: {
  id: number;
  input: unknown;
}): Promise<ActionResult<{ slug: string; status: string }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ slug: string; status: string }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  const parsed = makeGameSchema().safeParse(args.input);
  if (!parsed.success) return validationFailure(parsed.error, 'Revisá los campos del juego.');
  const value = parsed.data;
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(games)
        .where(eq(games.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.status === 'trashed') return { type: 'state' as const };
      if (before.status !== value.status) return { type: 'state_conflict' as const };
      const cover = await resolveCover(tx, value.coverMediaId);
      if (!cover.valid) return { type: 'media' as const };
      const [updated] = await tx
        .update(games)
        .set({
          slug: value.slug,
          title: value.title,
          description: value.description,
          body: value.body,
          developer: value.developer ?? null,
          publisher: value.publisher ?? null,
          releaseDate: value.releaseDate ?? null,
          platforms: value.platforms,
          genres: value.genres,
          tags: value.tags,
          featured: value.featured,
          coverMediaId: value.coverMediaId ?? null,
          coverImageUrl: cover.coverImageUrl,
          coverAlt: value.coverAlt ?? null,
        })
        .where(eq(games.id, args.id))
        .returning();
      if (!updated) return { type: 'missing' as const };
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El juego no existe.');
    if (outcome.type === 'state')
      return failure('conflict', 'Un juego en la papelera no se puede editar.');
    if (outcome.type === 'state_conflict')
      return failure(
        'conflict',
        'Usá los botones de publicar o despublicar para cambiar el estado.'
      );
    if (outcome.type === 'media')
      return failure('conflict', 'La portada no existe o está marcada para eliminación.', {
        fieldErrors: { coverMediaId: ['Elegí otra imagen.'] },
      });
    invalidateGame(outcome.before.slug);
    if (outcome.before.slug !== outcome.updated.slug) invalidateGame(outcome.updated.slug);
    logger.info('games.update.succeeded', { gameId: outcome.updated.id });
    return {
      ok: true,
      data: { slug: outcome.updated.slug, status: outcome.updated.status },
    };
  } catch (error) {
    return writeFailure(error, 'games.update.failed', 'No se pudo actualizar el juego.');
  }
}

/** Publishes a game. A published game always has a cover. */
export async function publishGame(args: {
  id: number;
}): Promise<ActionResult<{ status: 'published' }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ status: 'published' }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(games)
        .where(eq(games.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.status !== 'draft') return { type: 'state' as const };
      if (!before.coverMediaId || !before.coverImageUrl) return { type: 'cover' as const };
      const [updated] = await tx
        .update(games)
        .set({ status: 'published' })
        .where(eq(games.id, args.id))
        .returning();
      if (!updated) return { type: 'missing' as const };
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El juego no existe.');
    if (outcome.type === 'state')
      return failure('conflict', 'Solo se puede publicar un borrador de juego.');
    if (outcome.type === 'cover')
      return failure('conflict', 'Un juego publicado necesita una portada.', {
        fieldErrors: { coverMediaId: ['Subí o elegí una portada.'] },
      });
    invalidateGame(outcome.updated.slug);
    logger.info('games.publish.succeeded', { gameId: outcome.updated.id });
    return { ok: true, data: { status: 'published' } };
  } catch (error) {
    return writeFailure(error, 'games.publish.failed', 'No se pudo publicar el juego.');
  }
}

export async function unpublishGame(args: {
  id: number;
}): Promise<ActionResult<{ status: 'draft' }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ status: 'draft' }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(games)
        .where(eq(games.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.status !== 'published') return { type: 'state' as const };
      // A published review needs a published game. Hiding the game would leave
      // those reviews pointing to an unpublished sheet, so the action is
      // refused while they exist.
      if (await hasPublishedReviews(tx, before.id)) return { type: 'reviews' as const };
      const [updated] = await tx
        .update(games)
        .set({ status: 'draft' })
        .where(eq(games.id, args.id))
        .returning();
      if (!updated) return { type: 'missing' as const };
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El juego no existe.');
    if (outcome.type === 'state')
      return failure('conflict', 'Solo se puede despublicar un juego publicado.');
    if (outcome.type === 'reviews')
      return failure(
        'conflict',
        'No se puede despublicar: el juego tiene reseñas publicadas. Despublicá esas reseñas primero.'
      );
    invalidateGame(outcome.updated.slug);
    logger.info('games.unpublish.succeeded', { gameId: outcome.updated.id });
    return { ok: true, data: { status: 'draft' } };
  } catch (error) {
    return writeFailure(error, 'games.unpublish.failed', 'No se pudo despublicar el juego.');
  }
}

export async function trashGame(args: {
  id: number;
}): Promise<ActionResult<{ status: 'trashed' }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ status: 'trashed' }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(games)
        .where(eq(games.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.status === 'trashed') return { type: 'state' as const };
      // Trashing a published game hides it exactly like unpublishing it, so the
      // same review guard applies.
      if (before.status === 'published' && (await hasPublishedReviews(tx, before.id)))
        return { type: 'reviews' as const };
      const [updated] = await tx
        .update(games)
        .set({
          status: 'trashed',
          previousStatus: before.status,
          trashedAt: new Date(),
        })
        .where(eq(games.id, args.id))
        .returning();
      if (!updated) return { type: 'missing' as const };
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El juego no existe.');
    if (outcome.type === 'state') return failure('conflict', 'El juego ya está en la papelera.');
    if (outcome.type === 'reviews')
      return failure(
        'conflict',
        'No se puede mover a la papelera: el juego tiene reseñas publicadas. Despublicá esas reseñas primero.'
      );
    invalidateGame(outcome.updated.slug);
    logger.info('games.trash.succeeded', { gameId: outcome.updated.id });
    return { ok: true, data: { status: 'trashed' } };
  } catch (error) {
    return writeFailure(error, 'games.trash.failed', 'No se pudo mover el juego a la papelera.');
  }
}

export async function restoreGame(args: {
  id: number;
}): Promise<ActionResult<{ status: 'draft' | 'published' }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ status: 'draft' | 'published' }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(games)
        .where(eq(games.id, args.id))
        .limit(1)
        .for('update');
      if (!before) return { type: 'missing' as const };
      if (before.status !== 'trashed') return { type: 'state' as const };
      const status = before.previousStatus === 'published' ? 'published' : 'draft';
      const [updated] = await tx
        .update(games)
        .set({ status, previousStatus: null, trashedAt: null })
        .where(eq(games.id, args.id))
        .returning();
      if (!updated) return { type: 'missing' as const };
      return { type: 'ok' as const, before, updated };
    });
    if (outcome.type === 'missing') return failure('not_found', 'El juego no existe.');
    if (outcome.type === 'state')
      return failure('conflict', 'Solo se puede restaurar un juego de la papelera.');
    invalidateGame(outcome.updated.slug);
    logger.info('games.restore.succeeded', { gameId: outcome.updated.id });
    return {
      ok: true,
      data: { status: outcome.updated.status as 'draft' | 'published' },
    };
  } catch (error) {
    return writeFailure(error, 'games.restore.failed', 'No se pudo restaurar el juego.');
  }
}
