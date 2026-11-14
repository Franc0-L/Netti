import { asc, eq, lte, and, or, gt, gte } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { articles, cronRuns } from '@/db/schema';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';
import { affectedTags, type ArticleTagState } from '@/lib/tags';

export const maxDuration = 30;

const JOB_NAME = 'revalidate_scheduled';
const BATCH_SIZE = 200;
const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/**
 * Overlap window for late writes.
 *
 * A publication inserted directly in PostgreSQL, or moved to a date that is
 * already behind the cursor, would never be picked up by a strictly monotonic
 * cursor. The job also scans the rows touched during the last hour, so those
 * writes are activated without ever moving the cursor backwards.
 */
const OVERLAP_WINDOW_MS = 60 * 60 * 1000;
const OVERLAP_BATCH_SIZE = 100;

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function tagsOf(rows: Array<typeof articles.$inferSelect>) {
  const tags = new Set<string>();
  for (const row of rows) {
    const state: ArticleTagState = {
      id: row.id,
      kind: row.kind as ArticleTagState['kind'],
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
    for (const tag of affectedTags(null, state)) tags.add(tag);
  }
  return tags;
}

/**
 * Activates scheduled publications whose `published_at` has already passed.
 *
 * The job is idempotent and resumable through the `(published_at, id)` cursor
 * stored in `cron_runs`. Revalidating an already visible article twice is
 * harmless. Called by the GitHub Actions workflow every 30 minutes.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return response(401, { ok: false, error: 'Unauthorized' });

  const now = new Date();

  try {
    const [run] = await db.select().from(cronRuns).where(eq(cronRuns.jobName, JOB_NAME)).limit(1);

    const cursorDate = run?.lastPublishedAt ?? new Date(now.getTime() - INITIAL_LOOKBACK_MS);
    const cursorId = run?.lastId ?? 0;

    // New publications: strictly after the cursor, so the cursor is monotonic.
    const due = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          lte(articles.publishedAt, now),
          or(
            gt(articles.publishedAt, cursorDate),
            and(eq(articles.publishedAt, cursorDate), gt(articles.id, cursorId))
          )
        )
      )
      .orderBy(asc(articles.publishedAt), asc(articles.id))
      .limit(BATCH_SIZE);

    // Late writes: rows touched during the overlap window that the cursor has
    // already passed. They are revalidated but never move the cursor.
    const overlapSince = new Date(now.getTime() - OVERLAP_WINDOW_MS);
    const late = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          lte(articles.publishedAt, now),
          gte(articles.updatedAt, overlapSince)
        )
      )
      .orderBy(asc(articles.publishedAt), asc(articles.id))
      .limit(OVERLAP_BATCH_SIZE);

    const tags = tagsOf(due);
    for (const tag of tagsOf(late)) tags.add(tag);

    for (const tag of tags) revalidateTag(tag, { expire: 0 });

    const last = due.at(-1);
    const cursor = last
      ? { lastPublishedAt: last.publishedAt, lastId: last.id }
      : {
          lastPublishedAt: run?.lastPublishedAt ?? null,
          lastId: run?.lastId ?? null,
        };

    await db
      .insert(cronRuns)
      .values({
        jobName: JOB_NAME,
        lastRunAt: now,
        lastSuccessAt: now,
        ...cursor,
      })
      .onConflictDoUpdate({
        target: cronRuns.jobName,
        set: { lastRunAt: now, lastSuccessAt: now, ...cursor },
      });

    return response(200, {
      ok: true,
      revalidated: due.length,
      lateRevalidated: late.length,
      tags: Array.from(tags),
      cursor: last ? { publishedAt: last.publishedAt, id: last.id } : null,
      more: due.length === BATCH_SIZE,
    });
  } catch (error) {
    logger.error('cron.revalidate.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    // Best effort: the run happened even if the result could not be stored.
    try {
      await db
        .insert(cronRuns)
        .values({ jobName: JOB_NAME, lastRunAt: now })
        .onConflictDoUpdate({ target: cronRuns.jobName, set: { lastRunAt: now } });
    } catch {
      /* PostgreSQL is the failing dependency; readiness will report it. */
    }
    return response(500, {
      ok: false,
      error: 'Revalidation failed',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}
