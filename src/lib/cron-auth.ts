import { timingSafeEqual } from 'node:crypto';

/**
 * Validates the `Authorization: Bearer <CRON_SECRET>` header used by the
 * scheduled endpoints.
 *
 * A minimum length is required and the comparison is constant-time so the
 * secret cannot be recovered by timing the response.
 */
export function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
