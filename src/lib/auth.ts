import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { sessions } from "@/db/schema.js";
import { env } from "@/lib/env.js";

const IDLE_SESSION_MS = 8 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function sessionIdForToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The browser receives the opaque token; only its SHA-256 digest is persisted.
 * Callers must store sessionId alongside the session timestamps and set token
 * in the HttpOnly cookie.
 */
export function createSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, sessionId: sessionIdForToken(token) };
}

export async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    throw new Error("No hay sesión activa");
  }

  const sessionId = sessionIdForToken(token);
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const now = new Date();
  if (
    !session ||
    session.expiresAt <= now ||
    session.absoluteExpiresAt <= now
  ) {
    if (session) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
    cookieStore.delete("session");
    throw new Error("Sesión inválida o expirada");
  }

  if (now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    const absoluteExpiry = session.absoluteExpiresAt.getTime();
    const nextExpiry = new Date(
      Math.min(now.getTime() + IDLE_SESSION_MS, absoluteExpiry),
    );
    const [updatedSession] = await db
      .update(sessions)
      .set({ lastUsedAt: now, expiresAt: nextExpiry })
      .where(eq(sessions.id, sessionId))
      .returning();

    if (!updatedSession) {
      cookieStore.delete("session");
      throw new Error("Sesión inválida o expirada");
    }

    return updatedSession;
  }

  return session;
}

export function assertSameOrigin(origin?: string) {
  if (!origin) {
    throw new Error("Origen no proporcionado");
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new Error("Origen inválido");
  }

  const configuredSiteUrl =
    env.PUBLIC_SITE_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");

  if (!configuredSiteUrl) {
    throw new Error("Origen permitido no configurado");
  }

  let allowedOrigin: URL;
  try {
    allowedOrigin = new URL(configuredSiteUrl);
  } catch {
    throw new Error("Origen permitido mal configurado");
  }

  if (originUrl.origin !== allowedOrigin.origin) {
    throw new Error("Origen no permitido");
  }
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  try {
    if (token) {
      await db
        .delete(sessions)
        .where(eq(sessions.id, sessionIdForToken(token)));
    }
  } finally {
    cookieStore.delete("session");
  }
}

export async function logoutAll() {
  const cookieStore = await cookies();
  try {
    await db.delete(sessions);
  } finally {
    cookieStore.delete("session");
  }
}
