export type ActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid'
  | 'conflict'
  | 'not_found'
  | 'rate_limited'
  | 'too_large'
  | 'server';
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ActionErrorCode;
      message: string;
      fieldErrors?: Record<string, string[]>;
      current?: unknown;
      retryAfter?: number;
    };
export function failure(
  code: ActionErrorCode,
  message: string,
  extra: Partial<Extract<ActionResult<never>, { ok: false }>> = {}
): ActionResult<never> {
  return { ok: false, code, message, ...extra };
}
export function zodFieldErrors(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
