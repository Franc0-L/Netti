import { and, count, eq, gt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { articles, media, sessions } from '@/db/schema';
import { requireSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function GET() {
  try {
    await requireSession({ clearCookie: true });
  } catch {
    return response(401, { ok: false, error: 'Unauthorized' });
  }

  const now = new Date();

  try {
    const [publishedArticles, activeSessions, storedMedia] = await Promise.all([
      db.select({ value: count() }).from(articles).where(eq(articles.status, 'published')),
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
