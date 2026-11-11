'use server';

import { cookies, headers } from 'next/headers';
import { db } from '@/db/index';
import { sessions } from '@/db/schema';
import {
  assertSameOrigin,
  attemptLogin,
  createSessionToken,
  getClientIp,
  revokeAllSessions,
  revokeCurrentSession,
  sessionDurations,
} from '@/lib/auth';
import { failure, type ActionResult } from '@/lib/action-result';
import { logger } from '@/lib/logger';

function originOf(h: Headers): string | undefined {
  const origin = h.get('origin');
  if (origin) return origin;
  const referer = h.get('referer');
  try {
    return referer ? new URL(referer).origin : undefined;
  } catch {
    return undefined;
  }
}

export async function login(input: {
  password: string;
}): Promise<ActionResult<{ expiresAt: string }>> {
  try {
    const h = await headers();
    assertSameOrigin(originOf(h));

    if (
      typeof input?.password !== 'string' ||
      input.password.length < 1 ||
      input.password.length > 1024
    ) {
      return failure('invalid', 'Ingresá la contraseña.');
    }

    const ip = getClientIp(h);
    const attempt = await attemptLogin(ip, input.password);
    if (!attempt.allowed) {
      logger.warn('admin.login.rate_limited');
      return failure('rate_limited', 'Demasiados intentos. Probá en unos minutos.', {
        retryAfter: attempt.retryAfter,
      });
    }

    if (!attempt.valid) {
      logger.warn('admin.login.rejected');
      return failure('unauthorized', 'La contraseña no es correcta.');
    }

    const { token, sessionId } = createSessionToken();
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + sessionDurations.absoluteMs);
    const expiresAt = new Date(
      Math.min(now.getTime() + sessionDurations.idleMs, absoluteExpiresAt.getTime())
    );

    await db.insert(sessions).values({
      id: sessionId,
      expiresAt,
      absoluteExpiresAt,
      lastUsedAt: now,
      userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
    });

    const store = await cookies();
    store.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(sessionDurations.absoluteMs / 1000),
    });

    logger.info('admin.login.succeeded');
    return {
      ok: true,
      data: { expiresAt: absoluteExpiresAt.toISOString() },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Origen')) {
      logger.warn('admin.login.origin_rejected');
      return failure('forbidden', 'Origen no permitido.');
    }
    logger.error('admin.login.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return failure('server', 'El panel no está configurado.');
  }
}

export async function logout(): Promise<ActionResult> {
  try {
    const h = await headers();
    assertSameOrigin(originOf(h));
    await revokeCurrentSession();
    logger.info('admin.logout.succeeded');
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Origen')) {
      logger.warn('admin.logout.origin_rejected');
      return failure('forbidden', 'Origen no permitido.');
    }
    logger.error('admin.logout.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return failure('server', 'No se pudo cerrar la sesión.');
  }
}

export async function logoutAll(): Promise<ActionResult> {
  try {
    const h = await headers();
    assertSameOrigin(originOf(h));
    await revokeAllSessions();
    logger.info('admin.logout_all.succeeded');
    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Origen')) {
      logger.warn('admin.logout_all.origin_rejected');
      return failure('forbidden', 'Origen no permitido.');
    }
    if (message.toLowerCase().includes('sesión')) {
      return failure('unauthorized', 'La sesión no es válida.');
    }
    logger.error('admin.logout_all.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return failure('server', 'No se pudieron cerrar las sesiones.');
  }
}
