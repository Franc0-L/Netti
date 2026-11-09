"use server";
import { cookies, headers } from "next/headers";
import { db } from "@/db/index";
import { sessions } from "@/db/schema";
import { assertSameOrigin, checkLoginRateLimit, createSessionToken, getClientIp, recordLoginAttempt, revokeAllSessions, revokeCurrentSession, sessionDurations, verifyAdminPassword } from "@/lib/auth";
import { failure, type ActionResult } from "@/lib/action-result";
function originOf(h: Headers): string | undefined { const origin = h.get("origin"); if (origin) return origin; const referer = h.get("referer"); try { return referer ? new URL(referer).origin : undefined; } catch { return undefined; } }
export async function login(input: { password: string }): Promise<ActionResult<{ expiresAt: string }>> {
  try {
    const h = await headers(); assertSameOrigin(originOf(h));
    if (typeof input?.password !== "string" || input.password.length < 1 || input.password.length > 1024) return failure("invalid", "Ingresá la contraseña.");
    const ip = getClientIp(h); const rate = await checkLoginRateLimit(ip);
    if (!rate.allowed) return failure("rate_limited", "Demasiados intentos. Probá en unos minutos.", { retryAfter: rate.retryAfter });
    const valid = await verifyAdminPassword(input.password); await recordLoginAttempt(ip, valid);
    if (!valid) return failure("unauthorized", "La contraseña no es correcta.");
    const { token, sessionId } = createSessionToken(); const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + sessionDurations.absoluteMs);
    const expiresAt = new Date(Math.min(now.getTime() + sessionDurations.idleMs, absoluteExpiresAt.getTime()));
    await db.insert(sessions).values({ id: sessionId, expiresAt, absoluteExpiresAt, lastUsedAt: now, userAgent: h.get("user-agent")?.slice(0, 300) ?? null });
    const store = await cookies(); store.set("session", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: Math.floor(sessionDurations.absoluteMs / 1000) });
    return { ok: true, data: { expiresAt: absoluteExpiresAt.toISOString() } };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Origen")) return failure("forbidden", "Origen no permitido.");
    return failure("server", "El panel no está configurado.");
  }
}
export async function logout(): Promise<ActionResult> {
  try { const h = await headers(); assertSameOrigin(originOf(h)); await revokeCurrentSession(); return { ok: true, data: undefined }; }
  catch (error) { if (error instanceof Error && error.message.includes("Origen")) return failure("forbidden", "Origen no permitido."); return failure("server", "No se pudo cerrar la sesión."); }
}
export async function logoutAll(): Promise<ActionResult> {
  try { const h = await headers(); assertSameOrigin(originOf(h)); await revokeAllSessions(); return { ok: true, data: undefined }; }
  catch (error) { const message = error instanceof Error ? error.message : ""; if (message.includes("Origen")) return failure("forbidden", "Origen no permitido."); if (message.toLowerCase().includes("sesión")) return failure("unauthorized", "La sesión no es válida."); return failure("server", "No se pudieron cerrar las sesiones."); }
}
