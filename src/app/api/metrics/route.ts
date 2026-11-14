import { and, count, gt } from 'drizzle-orm';
import { connection, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { articles, media, sessions } from '@/db/schema';
import { requireSession, SessionRequiredError } from '@/lib/auth';
import { visibleArticle } from '@/lib/content';
import { logger } from '@/lib/logger';

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function GET() {
  // cacheComponents prerenders route handlers unless they opt into a request.
  await connection();
  try {
    await requireSession({ clearCookie: true });
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      return response(401, { ok: false, error: 'Unauthorized' });
    }
    logger.error('metrics.session.check.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return response(503, { ok: false, error: 'Metrics unavailable' });
  }

  const now = new Date();

  try {
    const [publishedArticles, activeSessions, storedMedia] = await Promise.all([
      // A scheduled publication is not public yet: it only counts once its
      // publication date has passed.
      db.select({ value: count() }).from(articles).where(visibleArticle(now)),
      db
        .select({ value: count() })
        .from(sessions)
        .where(and(gt(sessions.expiresAt, now), gt(sessions.absoluteExpiresAt, now))),
      db.select({ value: count() }).from(media),
    ]);

    return response(200, {
      ok: true,
      measuredAt: now.toISOString(),
      metrics: {
        publishedArticles: publishedArticles[0]?.value ?? 0,
        activeSessions: activeSessions[0]?.value ?? 0,
        storedImages: storedMedia[0]?.value ?? 0,
      },
    });
  } catch (error) {
    logger.error('metrics.query.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return response(503, { ok: false, error: 'Metrics unavailable' });
  }
}
