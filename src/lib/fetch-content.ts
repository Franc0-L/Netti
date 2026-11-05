import { parse as parseYaml } from "yaml";
import { normalizeMediaPath } from "./image-url";
import { githubFetch, GitHubHttpError } from "./github-fetch";
import type {
  EditorialCollection,
  GamesData,
  ReviewsData,
  NewsData,
  GuidesData,
  EditorialData,
} from "./editorial-contract";
import { editorialSchemas } from "./editorial-contract";

export type Collection = EditorialCollection;

export type CollectionData = EditorialData;

// Re-exportar tipos para compatibilidad con similar-games.ts y search-index.json.ts
export type { GamesData, ReviewsData, NewsData, GuidesData };

export type CollectionEntryMap = {
  games: CollectionEntry<GamesData>;
  reviews: CollectionEntry<ReviewsData>;
  news: CollectionEntry<NewsData>;
  guides: CollectionEntry<GuidesData>;
};

export interface CollectionEntry<T = Record<string, unknown>> {
  id: string;
  data: T;
  body: string;
}

// Caché en memoria de las respuestas de GitHub usadas para renderizar el sitio.
const CONTENT_CACHE_TTL_MS = 60_000;
const CONTENT_CACHE_MAX_ENTRIES = 200;
const contentCache = new Map<string, { value: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();

function storeInContentCache(path: string, value: unknown): void {
  if (contentCache.size >= CONTENT_CACHE_MAX_ENTRIES) {
    const oldest = contentCache.keys().next().value;
    if (oldest !== undefined) contentCache.delete(oldest);
  }
  contentCache.set(path, {
    value,
    expiresAt: Date.now() + CONTENT_CACHE_TTL_MS,
  });
}

async function cachedGithubFetch<T>(path: string, retries = 3): Promise<T> {
  const cached = contentCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  // Deduplica llamadas concurrentes al mismo recurso.
  const pending = inFlight.get(path);
  if (pending) return pending as Promise<T>;

  const request = githubFetch(path, { retries })
    .then((value) => {
      storeInContentCache(path, value);
      return value;
    })
    .finally(() => {
      inFlight.delete(path);
    });

  inFlight.set(path, request);
  return request as Promise<T>;
}

// Vacía la caché en memoria (útil en pruebas o tras una publicación).
export function clearContentCache(): void {
  contentCache.clear();
  inFlight.clear();
}

function parseContent(raw: string): {
  data: Record<string, unknown>;
  content: string;
} {
  // Soporta tanto line endings Unix (\n) como Windows (\r\n)
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  let data: Record<string, unknown> = {};
  let content = raw;

  if (frontmatterMatch) {
    try {
      data =
        (parseYaml as unknown as (s: string) => Record<string, unknown>)(
          frontmatterMatch[1],
        ) || {};
      content = raw.slice(frontmatterMatch[0].length).trimStart();
    } catch {
      data = {};
      content = raw;
    }
  }

  return { data, content };
}

function validateEntry(
  collection: Collection,
  id: string,
  data: Record<string, unknown>,
  body: string,
): { id: string; data: Record<string, unknown>; body: string } | null {
  const schema = editorialSchemas[collection];
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      `[fetch-content] Entrada omitida por frontmatter inválido: ${collection}/${id}`,
    );
    return null;
  }
  return {
    id,
    data: normalizeMediaFields(result.data as Record<string, unknown>),
    body,
  };
}

// Unifica las rutas heredadas en la ruta canónica que sirve el endpoint del sitio.
function normalizeMediaFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...data };
  for (const key of ["coverImage", "heroImage"]) {
    if (typeof normalized[key] === "string") {
      normalized[key] = normalizeMediaPath(normalized[key]);
    }
  }
  if (Array.isArray(normalized.gallery)) {
    normalized.gallery = normalized.gallery.map((item) =>
      item &&
      typeof item === "object" &&
      "src" in item &&
      typeof item.src === "string"
        ? { ...item, src: normalizeMediaPath(item.src) }
        : item,
    );
  }
  return normalized;
}

// Obtiene todas las publicaciones de una colección desde la API de GitHub.
export async function getCollectionEntries<T extends Collection = Collection>(
  collection: T,
): Promise<CollectionEntryMap[T][]> {
  const tree = (await cachedGithubFetch(`/git/trees/main?recursive=1`, 3)) as {
    tree: { type: string; path: string }[];
  };

  if (!Array.isArray(tree.tree)) {
    throw new Error("No se pudo obtener el árbol del repositorio");
  }

  const files = tree.tree.filter(
    (item: { type: string; path: string }) =>
      item.type === "blob" &&
      !item.path.includes("/.deleted/") &&
      item.path.match(
        new RegExp(`^content/${collection}/[a-z0-9]+(?:-[a-z0-9]+)*\\.md$`),
      ),
  );

  const entries = await Promise.all(
    files.map(async (item: { path: string }) => {
      const blob = (await cachedGithubFetch(`/contents/${item.path}`)) as {
        encoding: string;
        content: string;
      };
      if (blob.encoding !== "base64" || typeof blob.content !== "string") {
        return null;
      }
      const raw = Buffer.from(blob.content, "base64").toString("utf8");
      const { data, content } = parseContent(raw);
      const id = item.path.split("/").pop()!.replace(/\.md$/, "");
      return validateEntry(collection, id, data, content);
    }),
  );

  return entries.filter(
    (e): e is { id: string; data: Record<string, unknown>; body: string } =>
      e !== null,
  ) as CollectionEntryMap[T][];
}

// Obtiene una publicación específica por su slug desde la API de GitHub.
export async function getCollectionEntry<T extends Collection = Collection>(
  collection: T,
  slug: string,
): Promise<CollectionEntryMap[T] | null> {
  let blob: { encoding: string; content: string };
  try {
    blob = (await cachedGithubFetch(
      `/contents/content/${collection}/${slug}.md`,
      3,
    )) as { encoding: string; content: string };
  } catch (error) {
    // Un 404 significa que la publicación no existe: la página debe responder 404, no un error 500.
    if (error instanceof GitHubHttpError && error.status === 404) {
      return null;
    }
    throw error;
  }

  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    return null;
  }

  const raw = Buffer.from(blob.content, "base64").toString("utf8");
  const { data, content } = parseContent(raw);
  return validateEntry(collection, slug, data, content) as
    CollectionEntryMap[T] | null;
}

// Valida que una colección exista en los schemas definidos.
export function isValidCollection(
  collection: string,
): collection is Collection {
  return collection in editorialSchemas;
}
