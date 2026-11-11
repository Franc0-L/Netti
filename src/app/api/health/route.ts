import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db/index';
import { logger } from '@/lib/logger';
import { storage } from '@/lib/storage';

type DependencyStatus = 'ok' | 'error' | 'skipped';

export async function GET() {
  const checkedAt = new Date().toISOString();
  const dependencies: {
    database: DependencyStatus;
    blob: DependencyStatus;
  } = {
    database: 'error',
    blob: process.env.BLOB_READ_WRITE_TOKEN ? 'error' : 'skipped',
  };

  try {
    await db.execute(sql`select 1`);
    dependencies.database = 'ok';
  } catch (error) {
    logger.error('health.database.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      // A bounded list request checks Blob API access without exposing object names.
      await storage.list({ prefix: '__netti_health_check__/', limit: 1 });
      dependencies.blob = 'ok';
    } catch (error) {
      logger.error('health.blob.failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  const failed = Object.values(dependencies).some((status) => status === 'error');
  const skipped = Object.values(dependencies).some((status) => status === 'skipped');
  const status = failed ? 'unhealthy' : skipped ? 'degraded' : 'ok';

  return NextResponse.json(
    {
      status,
      service: 'netti',
      checkedAt,
      dependencies,
    },
    {
      status: failed ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
