import "server-only";
import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/index.js";
import { loginAttempts, sessions } from "@/db/schema.js";
import { env } from "@/lib/env.js";
import { remainingLoginDelay } from "@/lib/rate-limit.js";
const scrypt = promisify(scryptCallback);
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
  try { return await work(); }
  finally { const next = waiters.shift(); if (next) next(); else scryptBusy = false; }
}
function digestToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function digestIp(ip: string): string { return createHmac("sha256", env.CRON_SECRET).update(ip).digest("hex"); }
export function getClientIp(h: Headers): string { const raw = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim(); return raw && raw.length <= 64 ? raw : "unknown"; }
export async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const where = and(eq(loginAttempts.ipHash, digestIp(ip)), eq(loginAttempts.success, false), gte(loginAttempts.attemptedAt, new Date(Date.now() - WINDOW_MS)));
  const [summary] = await db.select({ total: count() }).from(loginAttempts).where(where);
  const [latest] = await db.select({ attemptedAt: loginAttempts.attemptedAt }).from(loginAttempts).where(where).orderBy(desc(loginAttempts.attemptedAt)).limit(1);
  const retryAfter = latest ? remainingLoginDelay(Number(summary?.total ?? 0), latest.attemptedAt.getTime()) : 0;
  return { allowed: retryAfter === 0, retryAfter };
}
export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> { await db.insert(loginAttempts).values({ ipHash: digestIp(ip), success }); }
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const parts = env.ADMIN_PASSWORD_HASH.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt" || Number(parts[1]) !== 131072 || Number(parts[2]) !== 8 || Number(parts[3]) !== 1) throw new Error("ADMIN_PASSWORD_HASH inválido");
  const salt = Buffer.from(parts[4], "base64"); const expected = Buffer.from(parts[5], "base64");
  if (salt.length < 16 || expected.length !== 64) throw new Error("ADMIN_PASSWORD_HASH inválido");
  const actual = await withScryptSlot(() => scrypt(password, salt, expected.length, { N: 131072, r: 8, p: 1, maxmem: MAXMEM })) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createSessionToken() { const token = randomBytes(32).toString("base64url"); return { token, sessionId: digestToken(token) }; }
export async function requireSession() {
  const store = await cookies(); const token = store.get("session")?.value;
  if (!token) throw new Error("No hay sesión activa");
  const id = digestToken(token); const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1); const now = new Date();
  if (!session || session.expiresAt <= now || session.absoluteExpiresAt <= now) { try { if (session) await db.delete(sessions).where(eq(sessions.id, id)); } finally { store.delete("session"); } throw new Error("Sesión inválida o expirada"); }
  if (now.getTime() - session.lastUsedAt.getTime() >= TOUCH_MS) {
    const expiresAt = new Date(Math.min(now.getTime() + IDLE_MS, session.absoluteExpiresAt.getTime()));
    const [updated] = await db.update(sessions).set({ lastUsedAt: now, expiresAt }).where(eq(sessions.id, id)).returning();
    if (!updated) { store.delete("session"); throw new Error("Sesión inválida o expirada"); }
    return updated;
  }
  return session;
}
export function assertSameOrigin(origin?: string) {
  if (!origin) throw new Error("Origen no proporcionado");
  let received: URL; try { received = new URL(origin); } catch { throw new Error("Origen inválido"); }
  const configured = env.PUBLIC_SITE_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!configured) throw new Error("Origen permitido no configurado");
  let allowed: URL; try { allowed = new URL(configured); } catch { throw new Error("Origen permitido mal configurado"); }
  if (received.origin !== allowed.origin) throw new Error("Origen no permitido");
}
export async function revokeCurrentSession() { const store = await cookies(); const token = store.get("session")?.value; try { if (token) await db.delete(sessions).where(eq(sessions.id, digestToken(token))); } finally { store.delete("session"); } }
export async function revokeAllSessions() { await requireSession(); const store = await cookies(); try { await db.delete(sessions); } finally { store.delete("session"); } }
export const sessionDurations = { idleMs: IDLE_MS, absoluteMs: ABSOLUTE_MS };
