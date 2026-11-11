import { asc, eq, lte, and, or, gt } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { articles, cronRuns } from '@/db/schema';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { affectedTags, type ArticleTagState } from '@/lib/tags';

export const maxDuration = 30;

const JOB_NAME = 'revalidate_scheduled';
const BATCH_SIZE = 200;
const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
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

    const tags = new Set<string>();
    for (const row of due) {
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
      tags: Array.from(tags),
      cursor: last ? { publishedAt: last.publishedAt, id: last.id } : null,
      more: due.length === BATCH_SIZE,
    });
  } catch (error) {
    return response(500, {
      ok: false,
      error: 'Revalidation failed',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}
