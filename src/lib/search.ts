/**
 * Pure search helpers.
 *
 * The public search runs over a cached static index instead of Postgres, so
 * the matching logic lives here: it is deterministic, fast and unit tested.
 */

/**
 * Normalizes text for comparison.
 *
 * Lowercases, trims and removes diacritics, so `Pokemon` matches `Pokémon` and
 * the search ignores accents the same way the legacy site did. The function is
 * idempotent: normalizing an already normalized value returns the same text.
 */
export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** A searchable document of the static index. */
export type SearchDocument = {
  title: string;
  description: string;
  tags: string[];
};

/**
 * Builds the normalized haystack of a document.
 *
 * The title is indexed twice so a match on the title outranks a match buried
 * in the description when results are ordered.
 */
export function searchHaystack(document: SearchDocument): string {
  return normalizeSearchText(
    [document.title, document.title, document.description, ...document.tags].join(' ')
  );
}

/** Returns true when the document matches the query. */
export function documentMatches(document: SearchDocument, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query.slice(0, 80));
  if (!normalizedQuery) return true;
  return searchHaystack(document).includes(normalizedQuery);
}

/**
 * Filters and paginates a list of documents.
 *
 * @param documents Documents to search, already ordered by relevance.
 * @param query Raw user query.
 * @param limit Maximum number of results per page.
 * @param offset Number of results to skip.
 */
export function searchDocuments<T extends SearchDocument>(
  documents: readonly T[],
  query: string,
  limit = 20,
  offset = 0
): { results: T[]; total: number } {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const safeOffset = Math.max(Math.trunc(offset), 0);

  const matches = documents.filter((document) => documentMatches(document, query));
  return {
    results: matches.slice(safeOffset, safeOffset + safeLimit),
    total: matches.length,
  };
}
