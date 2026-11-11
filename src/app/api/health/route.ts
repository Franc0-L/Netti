import { connection } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Liveness probe.
 *
 * It deliberately does not touch PostgreSQL or Vercel Blob: the public health
 * check must never wake the Neon compute. Dependency readiness lives in
 * /api/ready and is intended for internal monitoring.
 */
export async function GET() {
  // cacheComponents prerenders route handlers unless they opt into a request.
  await connection();
  return NextResponse.json(
    {
      status: 'ok',
      service: 'netti',
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
