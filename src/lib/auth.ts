import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { sessions } from "@/db/schema.js";
import { env } from "@/lib/env.js";

export async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    throw new Error("No hay sesión activa");
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, token))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    throw new Error("Sesión inválida o expirada");
  }

  const now = new Date();
  const fiveMinutesAgo = new Date(session.lastUsedAt.getTime() - 5 * 60 * 1000);
  if (session.lastUsedAt < fiveMinutesAgo) {
    await db
      .update(sessions)
      .set({ lastUsedAt: now })
      .where(eq(sessions.id, token));
  }

  return session;
}

export function assertSameOrigin(origin?: string) {
  if (!origin) {
    throw new Error("Origen no proporcionado");
  }

  try {
    const originUrl = new URL(origin);
    const allowedOrigin = new URL(
      env.PUBLIC_SITE_URL ?? "http://localhost:3000",
    );

    if (originUrl.origin !== allowedOrigin.origin) {
      throw new Error("Origen no permitido");
    }
  } catch {
    throw new Error("Origen inválido");
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function logoutAll() {
  await db.delete(sessions);
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
