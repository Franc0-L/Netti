import { getTree, readMarkdownFile } from "../github/contents.js";

const LIST_PAGE_SIZE = 50;

let treeCache: {
  tree: { type: string; path: string; sha: string }[];
  fetchedAt: number;
} | null = null;
const TREE_CACHE_TTL_MS = 60_000;

function treeCacheFresh(): boolean {
  return (
    treeCache !== null && Date.now() - treeCache.fetchedAt < TREE_CACHE_TTL_MS
  );
}

function invalidateTreeCache(): void {
  treeCache = null;
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

// Lista las entradas de una colección con paginación.
export async function listEntries(
  collection?: string,
  page = 1,
): Promise<{
  entries: { collection: string; slug: string; sha: string }[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}> {
  const paths = await contentPaths(collection);
  const pageCount = Math.ceil(paths.length / LIST_PAGE_SIZE);
  if (page > Math.max(pageCount, 1)) {
    return {
      entries: [],
      page,
      pageSize: LIST_PAGE_SIZE,
      pageCount,
      total: paths.length,
    };
  }
  const paginated = paths.slice(
    (page - 1) * LIST_PAGE_SIZE,
    page * LIST_PAGE_SIZE,
  );
  return {
    entries: paginated.map((item) => {
      const [, collectionName, filename] = item.path.split("/");
      return {
        collection: collectionName,
        slug: filename.slice(0, -3),
        sha: item.sha,
      };
    }),
    page,
    pageSize: LIST_PAGE_SIZE,
    pageCount,
    total: paths.length,
  };
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
