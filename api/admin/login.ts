import { timingSafeEqual } from "node:crypto";
import {
  assertSameOrigin,
  clearSessionCookie,
  createSession,
  json,
  logAdminError,
  setSessionCookie,
} from "../_lib/security.js";
import { getOptionalEnv, getRequiredEnv } from "../../src/lib/env-config.js";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const configuredGlobal = Number(getOptionalEnv("ADMIN_LOGIN_GLOBAL_MAX"));
const GLOBAL_MAX_ATTEMPTS =
  Number.isFinite(configuredGlobal) && configuredGlobal > 0
    ? configuredGlobal
    : 120;
const globalAttempts = { count: 0, resetAt: 0 };

function requestIp(req: {
  headers?: { [key: string]: string | string[] | undefined };
}): string {
  const forwarded =
    req.headers?.["x-vercel-forwarded-for"] ?? req.headers?.["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0] : "";
  return first.trim() || "unknown";
}

function equalSecret(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface AdminRequest {
  method?: string;
  headers?: { [key: string]: string | string[] | undefined };
  body?: unknown;
  query?: { [key: string]: string | string[] | undefined };
}

interface AdminResponse {
  setHeader(name: string, value: string): void;
  status(code: number): AdminResponse;
  send(body: string): void;
  json(body: unknown): void;
}

export default async function handler(req: AdminRequest, res: AdminResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Método no permitido." });
  }
  if (!assertSameOrigin(req))
    return json(res, 403, { error: "Origen no permitido." });

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return json(res, 400, { error: "Solicitud inválida." });
  }

  const data = body as { action?: unknown; password?: unknown };

  if (data.action === "logout") {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  let password: string;
  let sessionSecret: string;
  try {
    password = getRequiredEnv("ADMIN_PASSWORD");
    sessionSecret = getRequiredEnv("ADMIN_SESSION_SECRET");
  } catch {
    return json(res, 503, {
      error: "El panel todavía no está configurado por el administrador.",
    });
  }
  if (!password || sessionSecret.length < 32) {
    return json(res, 503, {
      error: "El panel todavía no está configurado por el administrador.",
    });
  }

  const ip = requestIp(req);
  const now = Date.now();
  if (globalAttempts.resetAt <= now) {
    globalAttempts.resetAt = now + WINDOW_MS;
    globalAttempts.count = 0;
  }
  if (globalAttempts.count >= GLOBAL_MAX_ATTEMPTS) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((globalAttempts.resetAt - now) / 1000)),
    );
    return json(res, 429, { error: "Demasiados intentos. Probá más tarde." });
  }
  globalAttempts.count += 1;

  if (attempts.size > 500) {
    for (const [key, value] of attempts)
      if (value.resetAt <= now) attempts.delete(key);
  }
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((entry.resetAt - now) / 1000)),
    );
    return json(res, 429, { error: "Demasiados intentos. Probá más tarde." });
  }
  if (!entry || entry.resetAt <= now)
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;

  if (
    typeof data.password !== "string" ||
    !equalSecret(data.password, password)
  ) {
    return json(res, 401, { error: "La contraseña no es correcta." });
  }

  attempts.delete(ip);
  try {
    setSessionCookie(res, createSession(sessionSecret));
    return json(res, 200, { ok: true });
  } catch (error) {
    logAdminError("admin_login_session_error", req, error, 503);
    return json(res, 503, { error: "No se pudo iniciar la sesión." });
  }
}
