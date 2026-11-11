import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import {
  articles,
  cronRuns,
  games,
  loginAttempts,
  media,
  mediaVariants,
  sessions,
  storageOrphans,
} from '@/db/schema';
import { planOrphanCleanup } from '@/lib/cleanup-plan';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { storage } from '@/lib/storage';

export const maxDuration = 30;

const JOB_NAME = 'reconcile_storage';
const LOGIN_ATTEMPT_RETENTION_DAYS = 7;
const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;
const BACKUP_GUARD_MS = 7 * 24 * 60 * 60 * 1000;
const ORPHAN_BATCH_SIZE = 50;
const MEDIA_BATCH_SIZE = 50;

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function isReferenced(mediaId: number): Promise<boolean> {
  const bodyPattern = `media:${mediaId}([^0-9]|$)`;
  const [articleRef] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      or(
        eq(articles.coverMediaId, mediaId),
        eq(articles.ogMediaId, mediaId),
        sql`${articles.body} ~ ${bodyPattern}`
      )
    )
    .limit(1);
  if (articleRef) return true;

  const [gameRef] = await db
    .select({ id: games.id })
    .from(games)
    .where(or(eq(games.coverMediaId, mediaId), sql`${games.body} ~ ${bodyPattern}`))
    .limit(1);
  return Boolean(gameRef);
}

/**
 * Storage reconciliation job.
 *
 * Covers the safe, database-driven part of the procedure:
 * - purges expired sessions and old login attempts;
 * - retries registered storage orphans;
 * - sweeps media marked for deletion after the grace period, deleting Blob
 *   objects only when no article or game still references them.
 *
 * Store-wide orphan listing is intentionally not performed here: it requires
 * real Blob access, costs advanced operations and must be measured in Phase 0.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return response(401, { ok: false, error: 'Unauthorized' });

  const now = new Date();

  try {
    const [restoreMarker] = await db
      .select({ backupRestoredAt: cronRuns.backupRestoredAt })
      .from(cronRuns)
      .where(eq(cronRuns.jobName, 'backup_restore'))
      .limit(1);

    if (
      restoreMarker?.backupRestoredAt &&
      now.getTime() - restoreMarker.backupRestoredAt.getTime() < BACKUP_GUARD_MS
    ) {
      return response(409, {
        ok: false,
        error: 'Reconciliation blocked after a recent backup restore',
      });
    }

    const attemptsBefore = new Date(
      now.getTime() - LOGIN_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const [removedAttempts, removedSessions] = await Promise.all([
      db
        .delete(loginAttempts)
        .where(lt(loginAttempts.attemptedAt, attemptsBefore))
        .returning({ id: loginAttempts.id }),
      db
        .delete(sessions)
        .where(or(lt(sessions.expiresAt, now), lt(sessions.absoluteExpiresAt, now)))
        .returning({ id: sessions.id }),
    ]);

    const pending = await db
      .select({
        id: storageOrphans.id,
        storageKey: storageOrphans.storageKey,
        action: storageOrphans.action,
      })
      .from(storageOrphans)
      .where(eq(storageOrphans.status, 'pending'))
      .orderBy(asc(storageOrphans.createdAt))
      .limit(ORPHAN_BATCH_SIZE);

    let repairedOrphans = 0;
    if (pending.length > 0) {
      const keys = pending.map((item) => item.storageKey);
      const [mediaRows, variantRows] = await Promise.all([
        db
          .select({ storageKey: media.storageKey })
          .from(media)
          .where(inArray(media.storageKey, keys)),
        db
          .select({ storageKey: mediaVariants.storageKey })
          .from(mediaVariants)
          .where(inArray(mediaVariants.storageKey, keys)),
      ]);
      const referenced = new Set([...mediaRows, ...variantRows].map((item) => item.storageKey));
      const plan = planOrphanCleanup(
        pending.map((item) => ({ ...item, action: item.action as 'put' | 'delete' })),
        referenced
      );

      if (plan.repairWithoutDeleteIds.length > 0) {
        await db
          .update(storageOrphans)
          .set({ status: 'repaired', repairedAt: now })
          .where(inArray(storageOrphans.id, plan.repairWithoutDeleteIds));
        repairedOrphans += plan.repairWithoutDeleteIds.length;
      }

      if (plan.deleteKeys.length > 0) {
        try {
          await storage.del(plan.deleteKeys);
          await db
            .update(storageOrphans)
            .set({ status: 'repaired', repairedAt: now })
            .where(inArray(storageOrphans.id, plan.deleteIds));
          repairedOrphans += plan.deleteIds.length;
        } catch {
          // Leave the rows pending so the next run retries the deletion.
        }
      }
    }

    const purgeCutoff = new Date(now.getTime() - PURGE_GRACE_MS);
    const markedMedia = await db
      .select({ id: media.id, storageKey: media.storageKey })
      .from(media)
      .where(lt(media.pendingDeleteAt, purgeCutoff))
      .orderBy(asc(media.pendingDeleteAt))
      .limit(MEDIA_BATCH_SIZE);

    let clearedMarks = 0;
    let deletedMedia = 0;
    let failedMedia = 0;

    for (const item of markedMedia) {
      if (await isReferenced(item.id)) {
        await db.update(media).set({ pendingDeleteAt: null }).where(eq(media.id, item.id));
        clearedMarks += 1;
        continue;
      }

      const variants = await db
        .select({ storageKey: mediaVariants.storageKey })
        .from(mediaVariants)
        .where(eq(mediaVariants.mediaId, item.id));
      const keys = [item.storageKey, ...variants.map((variant) => variant.storageKey)];

      try {
        await storage.del(keys);
        await db.delete(media).where(eq(media.id, item.id));
        deletedMedia += 1;
      } catch {
        await db.insert(storageOrphans).values({
          storageKey: item.storageKey,
          action: 'delete',
          status: 'pending',
        });
        failedMedia += 1;
      }
    }

    await db
      .insert(cronRuns)
      .values({ jobName: JOB_NAME, lastRunAt: now, lastSuccessAt: now })
      .onConflictDoUpdate({
        target: cronRuns.jobName,
        set: { lastRunAt: now, lastSuccessAt: now },
      });

    return response(200, {
      ok: true,
      removedLoginAttempts: removedAttempts.length,
      removedExpiredSessions: removedSessions.length,
      repairedStorageOrphans: repairedOrphans,
      markedMediaScanned: markedMedia.length,
      clearedMarks,
      deletedMedia,
      failedMedia,
    });
  } catch (error) {
    return response(500, {
      ok: false,
      error: 'Reconciliation failed',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}
