import 'server-only';
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { cookies } from 'next/headers';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { loginAttempts, sessions } from '@/db/schema';
import { env } from '@/lib/env';
import { normalizeIp } from '@/lib/ip';
import { remainingLoginDelay } from '@/lib/rate-limit';

/**
 * The request has no valid session.
 *
 * It is a typed error so the callers can tell it apart from an infrastructure
 * failure: a database outage must not be reported as an expired session.
 */
export class SessionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionRequiredError';
  }
}

/** The request origin is not allowed to mutate the content. */
export class OriginNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OriginNotAllowedError';
  }
}

function deriveScrypt(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { N: 131072, r: 8, p: 1, maxmem: MAXMEM },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived as Buffer);
      }
    );
  });
}
const IDLE_MS = 8 * 60 * 60 * 1000;
const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_MS = 5 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAXMEM = 256 * 1024 * 1024;
let scryptBusy = false;
const waiters: Array<() => void> = [];
async function withScryptSlot<T>(work: () => Promise<T>): Promise<T> {
  if (scryptBusy) await new Promise<void>((resolve) => waiters.push(resolve));
  scryptBusy = true;
  try {
    return await work();
  } finally {
    const next = waiters.shift();
    if (next) next();
    else scryptBusy = false;
  }
}
/**
 * Secret used to hash the client addresses.
 *
 * It is separate from `CRON_SECRET` so the operational secret can be rotated
 * without resetting the rate limit history. When it is not configured, the
 * cron secret is used as a fallback: the hashes stay stable between releases.
 */
const ipHashSecret = env.IP_HASH_SECRET ?? env.CRON_SECRET;

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
function digestIp(ip: string): string {
  return createHmac('sha256', ipHashSecret).update(ip).digest('hex');
}
/** Exposes the IP digest so integration checks can scope their fixtures. */
export function hashIp(ip: string): string {
  return digestIp(ip);
}
export function getClientIp(h: Headers): string {
  const raw =
    h.get('x-vercel-forwarded-for') ??
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return raw && raw.length <= 64 ? raw : 'unknown';
}
/**
 * Atomically checks the per-IP rate limit, verifies the password and records
 * the attempt.
 *
 * The advisory lock serializes concurrent attempts from the same IP. Without
 * it, several requests could read the same failure count and all pass the
 * check before any of them inserts a row, temporarily exceeding the limit.
 * The expensive scrypt derivation stays inside the lock, so an attacker cannot
 * queue unlimited parallel derivations from the same IP.
 */
export async function attemptLogin(
  ip: string,
  password: string
): Promise<{ allowed: boolean; retryAfter: number; valid: boolean }> {
  const ipHash = digestIp(normalizeIp(ip));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`login:${ipHash}`})::bigint)`);

    const where = and(
      eq(loginAttempts.ipHash, ipHash),
      eq(loginAttempts.success, false),
      gte(loginAttempts.attemptedAt, new Date(Date.now() - WINDOW_MS))
    );
    const [summary] = await tx.select({ total: count() }).from(loginAttempts).where(where);
    const [latest] = await tx
      .select({ attemptedAt: loginAttempts.attemptedAt })
      .from(loginAttempts)
      .where(where)
      .orderBy(desc(loginAttempts.attemptedAt))
      .limit(1);
    const retryAfter = latest
      ? remainingLoginDelay(Number(summary?.total ?? 0), latest.attemptedAt.getTime())
      : 0;

    if (retryAfter > 0) return { allowed: false, retryAfter, valid: false };

    const valid = await verifyAdminPassword(password);
    await tx.insert(loginAttempts).values({ ipHash, success: valid });
    return { allowed: true, retryAfter: 0, valid };
  });
}
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const parts = env.ADMIN_PASSWORD_HASH.split(':');
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    Number(parts[1]) !== 131072 ||
    Number(parts[2]) !== 8 ||
    Number(parts[3]) !== 1
  )
    throw new Error('ADMIN_PASSWORD_HASH inválido');
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length < 16 || expected.length !== 64) throw new Error('ADMIN_PASSWORD_HASH inválido');
  const actual = (await withScryptSlot(() =>
    deriveScrypt(password, salt, expected.length)
  )) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, sessionId: digestToken(token) };
}
/**
 * Options for {@link requireSession}.
 *
 * `clearCookie` deletes the session cookie when the session is missing or
 * expired. It must stay `false` in Server Components: Next.js only allows
 * mutating cookies from Server Functions and Route Handlers, so calling
 * `cookies().delete()` while rendering a component throws and masks the real
 * "Sesión inválida o expirada" error.
 */
export type RequireSessionOptions = {
  clearCookie?: boolean;
};

export async function requireSession(options: RequireSessionOptions = {}) {
  const store = await cookies();
  const token = store.get('session')?.value;
  if (!token) throw new SessionRequiredError('No hay sesión activa');
  const id = digestToken(token);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const now = new Date();
  if (!session || session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    try {
      if (session) await db.delete(sessions).where(eq(sessions.id, id));
    } finally {
      if (options.clearCookie) store.delete('session');
    }
    throw new SessionRequiredError('Sesión inválida o expirada');
  }
  if (now.getTime() - session.lastUsedAt.getTime() >= TOUCH_MS) {
    const expiresAt = new Date(
      Math.min(now.getTime() + IDLE_MS, session.absoluteExpiresAt.getTime())
    );
    const [updated] = await db
      .update(sessions)
      .set({ lastUsedAt: now, expiresAt })
      .where(eq(sessions.id, id))
      .returning();
    if (!updated) {
      if (options.clearCookie) store.delete('session');
      throw new SessionRequiredError('Sesión inválida o expirada');
    }
    return updated;
  }
  return session;
}
export function assertSameOrigin(origin?: string) {
  if (!origin) throw new OriginNotAllowedError('Origen no proporcionado');
  let received: URL;
  try {
    received = new URL(origin);
  } catch {
    throw new OriginNotAllowedError('Origen inválido');
  }
  const configured =
    env.PUBLIC_SITE_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000');
  if (!configured) throw new OriginNotAllowedError('Origen permitido no configurado');
  let allowed: URL;
  try {
    allowed = new URL(configured);
  } catch {
    throw new OriginNotAllowedError('Origen permitido mal configurado');
  }
  if (received.origin !== allowed.origin) throw new OriginNotAllowedError('Origen no permitido');
}
export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get('session')?.value;
  try {
    if (token) await db.delete(sessions).where(eq(sessions.id, digestToken(token)));
  } finally {
    store.delete('session');
  }
}
export async function revokeAllSessions() {
  // Server Action context: the stale cookie can be removed from the response.
  await requireSession({ clearCookie: true });
  const store = await cookies();
  try {
    await db.delete(sessions);
  } finally {
    store.delete('session');
  }
}
export const sessionDurations = { idleMs: IDLE_MS, absoluteMs: ABSOLUTE_MS };
