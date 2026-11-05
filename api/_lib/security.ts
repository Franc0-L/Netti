import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "netti_admin";
export const SESSION_SECONDS = 8 * 60 * 60;

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(secret: string, now = Date.now()): string {
  if (secret.length < 32)
    throw new Error("ADMIN_SESSION_SECRET debe tener al menos 32 caracteres.");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function isValidSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || secret.length < 32) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = Buffer.from(signature(parts[0], secret));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return false;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    return (
      Number.isInteger(payload.exp) && payload.exp > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export function cookieValue(
  header: string | undefined,
  name = COOKIE_NAME,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function hasSession(req: any): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET || "";
  return isValidSession(cookieValue(req.headers?.cookie), secret);
}

export function assertSameOrigin(req: any): boolean {
  const origin = req.headers?.origin;
  const host =
    process.env.VERCEL === "1"
      ? req.headers?.["x-forwarded-host"] || req.headers?.host
      : req.headers?.host;
  if (typeof origin !== "string" || typeof host !== "string") return false;
  try {
    const parsed = new URL(origin);
    return (
      parsed.host.toLowerCase() === String(host).toLowerCase() &&
      (parsed.protocol === "https:" || process.env.NODE_ENV !== "production")
    );
  } catch {
    return false;
  }
}

export function setSessionCookie(res: any, token: string): void {
  const secure =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`,
  );
}

export function clearSessionCookie(res: any): void {
  const secure =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
  );
}

export function json(res: any, status: number, body: unknown): void {
  res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .setHeader("Cache-Control", "no-store")
    .send(JSON.stringify(body));
}

export function logAdminError(
  event: string,
  req: any,
  error: unknown,
  status: number,
): void {
  const rawUrl = typeof req?.url === "string" ? req.url.split("?")[0] : "";
  const route = rawUrl.startsWith("/") ? rawUrl : "unknown";
  const requestId = req?.headers?.["x-vercel-id"];
  console.error(
    JSON.stringify({
      level: "error",
      event,
      route,
      method: typeof req?.method === "string" ? req.method : "unknown",
      status,
      errorName: error instanceof Error ? error.name : "UnknownError",
      ...(typeof requestId === "string" && requestId.length <= 200
        ? { requestId }
        : {}),
    }),
  );
}
