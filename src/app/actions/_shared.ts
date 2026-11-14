import { headers } from 'next/headers';
import {
  assertSameOrigin,
  OriginNotAllowedError,
  requireSession,
  SessionRequiredError,
} from '@/lib/auth';
import { failure, type ActionResult, zodFieldErrors } from '@/lib/action-result';
import { logger } from '@/lib/logger';

/**
 * Shared plumbing of the editorial server actions.
 *
 * The module lives next to the actions and is not a route: it only groups the
 * authorization and the validation helpers that every mutation needs.
 */

/** Reads the origin of the request, falling back to the referer. */
export function originOf(h: Headers): string | undefined {
  const origin = h.get('origin');
  if (origin) return origin;
  const referer = h.get('referer');
  try {
    return referer ? new URL(referer).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Authorizes a content mutation.
 *
 * The three outcomes are kept apart on purpose:
 *
 * - a rejected origin is a `forbidden` conflict;
 * - a missing session is an `unauthorized` conflict;
 * - anything else is an infrastructure failure, which is logged and reported
 *   as a server error instead of pretending the author was logged out.
 */
export async function authorize(): Promise<ActionResult<never> | null> {
  try {
    const h = await headers();
    assertSameOrigin(originOf(h));
    // Server Action context: an expired cookie can be removed from the response.
    await requireSession({ clearCookie: true });
    return null;
  } catch (error) {
    if (error instanceof OriginNotAllowedError) {
      return failure('forbidden', 'Origen no permitido.');
    }
    if (error instanceof SessionRequiredError) {
      return failure('unauthorized', 'Necesitás iniciar sesión.');
    }
    logger.error('panel.authorize.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return failure('server', 'No se pudo verificar la sesión.');
  }
}

/** Turns a Zod error into the field errors of the form. */
export function validationFailure(
  error: { issues: Array<{ path: PropertyKey[]; message: string }> },
  subject = 'Revisá los campos del formulario.'
): ActionResult<never> {
  return failure('invalid', subject, { fieldErrors: zodFieldErrors(error) });
}

/** Rejects a malformed identifier or version before touching the database. */
export function validId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
