import { NextResponse } from 'next/server';
import { asc, eq, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/db/index';
import {
  cronRuns,
  loginAttempts,
  media,
  mediaVariants,
  sessions,
  storageOrphans,
} from '@/db/schema';
import { planOrphanCleanup } from '@/lib/cleanup-plan';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';
import { storage } from '@/lib/storage';

export const maxDuration = 10;
const LOGIN_ATTEMPT_RETENTION_DAYS = 7;
const ORPHAN_BATCH_SIZE = 25;
const JOB_NAME = 'cleanup';

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Records that the job ran.
 *
 * `lastRunAt` is best effort: it is written even when the run failed, as long
 * as PostgreSQL is reachable. `lastSuccessAt` only advances when the run
 * finished without pending work, so monitoring can tell a degraded run from a
 * healthy one.
 */
async function recordRun(now: Date, successful: boolean) {
  const values = successful
    ? { jobName: JOB_NAME, lastRunAt: now, lastSuccessAt: now }
    : { jobName: JOB_NAME, lastRunAt: now };
  const update = successful ? { lastRunAt: now, lastSuccessAt: now } : { lastRunAt: now };
  await db
    .insert(cronRuns)
    .values(values)
    .onConflictDoUpdate({ target: cronRuns.jobName, set: update });
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return response(401, { ok: false, error: 'Unauthorized' });

  const now = new Date();
  const attemptsBefore = new Date(
    now.getTime() - LOGIN_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  try {
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

    let repaired = 0;
    let blocked = 0;
    let failed = 0;

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
        repaired += plan.repairWithoutDeleteIds.length;
      }

      blocked = plan.blockedIds.length;

      if (plan.deleteKeys.length > 0) {
        try {
          await storage.del(plan.deleteKeys);
          await db
            .update(storageOrphans)
            .set({ status: 'repaired', repairedAt: now })
            .where(inArray(storageOrphans.id, plan.deleteIds));
          repaired += plan.deleteIds.length;
        } catch (error) {
          // Keep failed objects pending so the next scheduled run retries them.
          failed = plan.deleteIds.length;
          logger.error('cron.cleanup.blob.delete.failed', {
            errorType: error instanceof Error ? error.name : 'unknown',
            failedObjects: failed,
          });
        }
      }
    }

    const unresolved = pending.length - repaired;
    // Blocked or failed deletions leave work pending: the run is degraded and
    // must not be reported as a success.
    const degraded = failed > 0 || blocked > 0;

    await recordRun(now, !degraded);

    if (degraded) {
      logger.error('cron.cleanup.degraded', {
        failedObjects: failed,
        blockedObjects: blocked,
        pendingObjects: unresolved,
      });
    }

    return response(degraded ? 500 : 200, {
      ok: !degraded,
      degraded,
      removedLoginAttempts: removedAttempts.length,
      removedExpiredSessions: removedSessions.length,
      repairedStorageOrphans: repaired,
      blockedStorageOrphans: blocked,
      failedStorageOrphans: failed,
      pendingStorageOrphans: unresolved,
      batchLimit: ORPHAN_BATCH_SIZE,
    });
  } catch (error) {
    logger.error('cron.cleanup.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    // Best effort: the run happened even if the result could not be stored.
    try {
      await recordRun(now, false);
    } catch {
      /* PostgreSQL is the failing dependency; readiness will report it. */
    }
    return response(500, { ok: false, error: 'Cleanup failed' });
  }
}
