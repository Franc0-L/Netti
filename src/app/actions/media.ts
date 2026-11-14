'use server';
import { updateTag } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { media } from '@/db/schema';
import { failure, type ActionResult } from '@/lib/action-result';
import { logger } from '@/lib/logger';
import { isMediaReferenced } from '@/lib/media-references';
import { makeMediaSchema } from '@/lib/validation';
import { authorize, validId, validationFailure } from './_shared';

/**
 * Media library actions.
 *
 * Deleting an image is a two-step, reversible operation: the panel only marks
 * it with `pending_delete_at`, and a scheduled sweep removes the object once
 * the grace period ended and nothing references it anymore.
 */

/** Invalidates every public rendering that can show the metadata of an image. */
function invalidateMedia(): void {
  updateTag('media');
  updateTag('articles');
  updateTag('games');
  updateTag('home');
}

export async function updateMedia(args: {
  id: number;
  input: unknown;
}): Promise<ActionResult<{ id: number }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ id: number }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  const parsed = makeMediaSchema().safeParse(args.input);
  if (!parsed.success) return validationFailure(parsed.error, 'Revisá los datos de la imagen.');
  const value = parsed.data;
  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: media.id, pendingDeleteAt: media.pendingDeleteAt })
        .from(media)
        .where(eq(media.id, args.id))
        .limit(1);
      if (!before) return { type: 'missing' as const };
      if (before.pendingDeleteAt !== null) return { type: 'marked' as const };
      const [updated] = await tx
        .update(media)
        .set({
          alt: value.alt ?? null,
          credit: value.credit ?? null,
          rights: value.rights,
          sourceUrl: value.sourceUrl ?? null,
        })
        .where(eq(media.id, args.id))
        .returning({ id: media.id });
      if (!updated) return { type: 'missing' as const };
      return { type: 'ok' as const };
    });

    if (outcome.type === 'missing') return failure('not_found', 'La imagen no existe.');
    if (outcome.type === 'marked')
      return failure(
        'conflict',
        'La imagen está marcada para eliminación. Restaurala antes de editarla.'
      );
    invalidateMedia();
    logger.info('media.update.succeeded', { mediaId: args.id });
    return { ok: true, data: { id: args.id } };
  } catch (error) {
    logger.error('media.update.failed', {
      mediaId: args.id,
      errorType: error instanceof Error ? error.name : 'unknown',
      errorCode: (error as { code?: string }).code ?? 'unknown',
    });
    return failure('server', 'No se pudo actualizar la imagen.');
  }
}

export async function markMediaForDeletion(args: {
  id: number;
}): Promise<ActionResult<{ id: number; pendingDeleteAt: string }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ id: number; pendingDeleteAt: string }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  try {
    const [row] = await db
      .select({ id: media.id, pendingDeleteAt: media.pendingDeleteAt })
      .from(media)
      .where(eq(media.id, args.id))
      .limit(1);
    if (!row) return failure('not_found', 'La imagen no existe.');
    if (row.pendingDeleteAt !== null)
      return failure('conflict', 'La imagen ya está marcada para eliminación.');
    if (await isMediaReferenced(args.id)) {
      return failure(
        'conflict',
        'La imagen todavía se usa en un artículo o juego. Quitá la referencia antes de eliminarla.',
        { fieldErrors: { id: ['La imagen está en uso.'] } }
      );
    }

    const pendingDeleteAt = new Date();
    await db.update(media).set({ pendingDeleteAt }).where(eq(media.id, args.id));
    invalidateMedia();
    logger.info('media.mark_deleted.succeeded', { mediaId: args.id });
    return { ok: true, data: { id: args.id, pendingDeleteAt: pendingDeleteAt.toISOString() } };
  } catch (error) {
    logger.error('media.mark_deleted.failed', {
      mediaId: args.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return failure('server', 'No se pudo marcar la imagen para eliminación.');
  }
}

export async function restoreMedia(args: { id: number }): Promise<ActionResult<{ id: number }>> {
  const auth = await authorize();
  if (auth) return auth as ActionResult<{ id: number }>;
  if (!validId(args?.id)) return failure('invalid', 'Identificador inválido.');
  try {
    const [row] = await db
      .select({ id: media.id, pendingDeleteAt: media.pendingDeleteAt })
      .from(media)
      .where(eq(media.id, args.id))
      .limit(1);
    if (!row) return failure('not_found', 'La imagen no existe.');
    // Idempotent: restoring a live image is not an error.
    if (row.pendingDeleteAt !== null) {
      await db.update(media).set({ pendingDeleteAt: null }).where(eq(media.id, args.id));
      invalidateMedia();
    }
    logger.info('media.restore.succeeded', { mediaId: args.id });
    return { ok: true, data: { id: args.id } };
  } catch (error) {
    logger.error('media.restore.failed', {
      mediaId: args.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return failure('server', 'No se pudo restaurar la imagen.');
  }
}
