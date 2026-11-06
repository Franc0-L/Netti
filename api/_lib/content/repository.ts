import { getTree, readMarkdownBlob } from "../github/contents.js";

const LIST_PAGE_SIZE = 50;

let treeCache: {
  tree: { type: string; path: string; sha: string }[];
  fetchedAt: number;
} | null = null;
const TREE_CACHE_TTL_MS = 60_000;
const SEARCH_INDEX_TTL_MS = 60_000;
let searchIndexCache: { entries: { collection: string; slug: string; sha: string; fields: Record<string, unknown> }[]; fetchedAt: number } | null = null;

function treeCacheFresh(): boolean {
  return (
    treeCache !== null && Date.now() - treeCache.fetchedAt < TREE_CACHE_TTL_MS
  );
}

function invalidateTreeCache(): void {
  treeCache = null;
  searchIndexCache = null;
}

async function getTreeCached(): Promise<
  { type: string; path: string; sha: string }[]
> {
  if (treeCacheFresh()) {
    return treeCache!.tree;
  }
  const tree = await getTree();
  treeCache = { tree, fetchedAt: Date.now() };
  return tree;
}

// Obtiene las rutas de archivos Markdown de una colección, filtradas y ordenadas.
export async function contentPaths(collection?: string): Promise<
  {
    type: string;
    path: string;
    sha: string;
  }[]
> {
  const tree = await getTreeCached();
  return tree
    .filter(
      (item) =>
        item.type === "blob" &&
        item.path.endsWith(".md") &&
        /^content\/(games|reviews|news|guides)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(
          item.path,
        ) &&
        (!collection || item.path.startsWith(`content/${collection}/`)),
    )
    .sort((a, b) => a.path.localeCompare(b.path));
}

// Construye un índice cacheado para que la búsqueda incluya toda la colección.
async function getSearchIndex() {
  if (searchIndexCache && Date.now() - searchIndexCache.fetchedAt < SEARCH_INDEX_TTL_MS) return searchIndexCache.entries;
  const paths = await contentPaths();
  const entries: { collection: string; slug: string; sha: string; fields: Record<string, unknown> }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      const index = cursor++;
      const item = paths[index];
      const [, collection, filename] = item.path.split("/");
      const slug = filename.slice(0, -3);
      const markdown = await readMarkdownBlob(item.sha);
      entries[index] = { collection, slug, sha: item.sha, fields: markdown.fields };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));
  searchIndexCache = { entries, fetchedAt: Date.now() };
  return entries;
}

function normalizeSearch(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export async function listEntries(
  collection?: string,
  page = 1,
  query = "",
): Promise<{
  entries: { collection: string; slug: string; sha: string; fields: Record<string, unknown> }[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}> {
  const paths = await contentPaths(collection);
  const normalizedQuery = normalizeSearch(query);
  let selected: { collection: string; slug: string; sha: string; fields?: Record<string, unknown> }[];
  if (normalizedQuery) {
    selected = (await getSearchIndex()).filter((entry) =>
      (!collection || entry.collection === collection) &&
      [entry.slug, entry.fields.title, entry.fields.description].some((value) => normalizeSearch(value).includes(normalizedQuery)),
    );
  } else {
    selected = paths.map((item) => {
      const [, collectionName, filename] = item.path.split("/");
      return { collection: collectionName, slug: filename.slice(0, -3), sha: item.sha };
    });
  }
  const pageCount = Math.ceil(selected.length / LIST_PAGE_SIZE);
  const total = selected.length;
  const paginated = selected.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);
  if (page > Math.max(pageCount, 1)) return { entries: [], page, pageSize: LIST_PAGE_SIZE, pageCount, total };
  return {
    entries: await Promise.all(paginated.map(async (item) => {
      const fields = item.fields ?? (await readMarkdownBlob(item.sha)).fields;
      return { collection: item.collection, slug: item.slug, sha: item.sha, fields };
    })),
    page,
    pageSize: LIST_PAGE_SIZE,
    pageCount,
    total,
  };
}

// Lista publicaciones eliminadas que pueden restaurarse desde la papelera.
export async function listTrashEntries(page = 1) {
  const tree = await getTreeCached();
  const paths = tree.filter((item) =>
    item.type === "blob" &&
    /^content\/(games|reviews|news|guides)\/\.deleted\/[a-z0-9-]+\.md$/.test(item.path),
  ).sort((a, b) => b.path.localeCompare(a.path));
  const pageCount = Math.ceil(paths.length / LIST_PAGE_SIZE);
  const paginated = paths.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);
  const entries = await Promise.all(paginated.map(async (item) => {
    const [, collection, , filename] = item.path.split("/");
    const slug = filename.slice(0, -3);
    const markdown = await readMarkdownFile(collection, `.deleted/${slug}`);
    return { collection, slug, sha: item.sha, fields: markdown.fields };
  }));
  return { entries, page, pageSize: LIST_PAGE_SIZE, pageCount, total: paths.length };
}

// Lista imágenes subidas para el navegador de medios del panel.
export async function listMediaEntries(page = 1) {
  const tree = await getTreeCached();
  const paths = tree.filter((item) =>
    item.type === "blob" &&
    /^media\/(games|reviews|news|guides)\/[a-z0-9-]+\/[^/]+\.(?:webp|avif|png|jpe?g|gif)$/i.test(item.path),
  ).sort((a, b) => b.path.localeCompare(a.path));
  const pageCount = Math.ceil(paths.length / LIST_PAGE_SIZE);
  const paginated = paths.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);
  const entries = paginated.map((item) => {
    const filename = item.path.split("/").pop() || item.path;
    return {
      collection: "media",
      slug: item.path,
      sha: item.sha,
      fields: { title: filename, coverImage: `/${item.path}`, coverAlt: filename },
    };
  });
  return { entries, page, pageSize: LIST_PAGE_SIZE, pageCount, total: paths.length };
}

// Busca una publicación en todo el árbol, sin limitarse a la primera página.
export async function findEntryBySlug(collection: string, slug: string): Promise<{ collection: string; slug: string; sha: string; page: number } | null> {
  const paths = await contentPaths(collection);
  const index = paths.findIndex((item) => item.path === `content/${collection}/${slug}.md`);
  if (index < 0) return null;
  return { collection, slug, sha: paths[index].sha, page: Math.floor(index / LIST_PAGE_SIZE) + 1 };
}

// Lee una entrada específica (frontmatter + cuerpo + sha) por colección y slug.
export async function readEntryBySlug(
  collection: string,
  slug: string,
): Promise<{
  collection: string;
  slug: string;
  title: string;
  fields: Record<string, unknown>;
  body: string;
  sha: string;
}> {
  const entry = await readMarkdownFile(collection, slug);
  const title = (entry.fields.title as string) || slug;
  return {
    collection,
    slug,
    title,
    fields: entry.fields,
    body: entry.body,
    sha: entry.sha,
  };
}

export { invalidateTreeCache };
