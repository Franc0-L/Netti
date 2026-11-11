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
import { storage } from '@/lib/storage';

export const maxDuration = 10;
const LOGIN_ATTEMPT_RETENTION_DAYS = 7;
const ORPHAN_BATCH_SIZE = 25;

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
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
        } catch {
          // Keep failed objects pending so the next scheduled run retries them.
          failed = plan.deleteIds.length;
        }
      }
    }

    const unresolved = pending.length - repaired;
    const update = { lastRunAt: now };
    if (unresolved === 0) {
      await db
        .insert(cronRuns)
        .values({ jobName: 'cleanup', lastRunAt: now, lastSuccessAt: now })
        .onConflictDoUpdate({
          target: cronRuns.jobName,
          set: { lastRunAt: now, lastSuccessAt: now },
        });
    } else {
      await db
        .insert(cronRuns)
        .values({ jobName: 'cleanup', ...update })
        .onConflictDoUpdate({ target: cronRuns.jobName, set: update });
    }

    return response(200, {
      ok: true,
      removedLoginAttempts: removedAttempts.length,
      removedExpiredSessions: removedSessions.length,
      repairedStorageOrphans: repaired,
      blockedStorageOrphans: blocked,
      failedStorageOrphans: failed,
      pendingStorageOrphans: unresolved,
      batchLimit: ORPHAN_BATCH_SIZE,
    });
  } catch {
    return response(500, { ok: false, error: 'Cleanup failed' });
  }
}
