/**
 * Helpers to read query string values safely.
 *
 * Next.js delivers `searchParams` as `string | string[] | undefined`: a
 * repeated parameter (`?q=a&q=b`) arrives as an array. Calling `.trim()` on
 * that array throws and turns a valid URL into a 500, so every read goes
 * through {@link firstParam} first.
 */

export type SearchParamValue = string | string[] | undefined;

/** Returns the first value of a query parameter, or an empty string. */
export function firstParam(value: SearchParamValue): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Returns the first value of a query parameter, trimmed and bounded.
 *
 * @param value Raw value coming from `searchParams`.
 * @param maxLength Maximum accepted length after trimming.
 */
export function firstParamText(value: SearchParamValue, maxLength = 80): string {
  return firstParam(value).trim().slice(0, maxLength);
}

/**
 * Escapes the wildcards of a `LIKE`/`ILIKE` pattern.
 *
 * The panel search treats what the editor typed as literal text: searching for
 * `100%` must not match every title, and searching for `_` must not match any
 * single character.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
