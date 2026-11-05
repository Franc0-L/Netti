import {
  getTree,
  writeMarkdownFile,
  deleteMarkdownFile,
} from "../github/contents.js";
import { stringify } from "yaml";
import { readEntryBySlug, invalidateTreeCache } from "./repository.js";

const collections = new Set(["games", "reviews", "news", "guides"]);

// Dry run: analiza qué se borraría sin tocar nada. Devuelve info del archivo y listas vacías de medios (pendiente de implementar).
export async function dryRunDelete(
  collection: string,
  slug: string,
  sha: string,
): Promise<{
  file: string;
  fileSha: string;
  media: {
    toDelete: Array<{ path: string; repoPath: string }>;
    toKeep: Array<{
      path: string;
      repoPath: string;
      usedBy: Array<{ collection: string; slug: string }>;
    }>;
  };
}> {
  const tree = await getTree();
  const filePath = `content/${collection}/${slug}.md`;
  const fileEntry = tree.tree.find(
    (item) => item.type === "blob" && item.path === filePath,
  );
  if (!fileEntry) {
    throw new Error("No se encontró la publicación solicitada.");
  }
  if (fileEntry.sha !== sha) {
    throw new Error(
      "La publicación cambió en GitHub. Recargá antes de eliminar.",
    );
  }

  await readEntryBySlug(collection, slug);

  return {
    file: filePath,
    fileSha: fileEntry.sha,
    media: {
      toDelete: [],
      toKeep: [],
    },
  };
}

// Borrado recuperable: mueve la publicación a `content/<coleccion>/.deleted/` y borra el original.
export async function performDelete(
  collection: string,
  slug: string,
  sha: string,
): Promise<{
  file: string;
  trashed: string;
  mediaDeleted: string[];
  mediaTrashed: string[];
  mediaDeleteFailed: string[];
  mediaKept: Array<{
    path: string;
    repoPath: string;
    usedBy: Array<{ collection: string; slug: string }>;
  }>;
  commit: string | undefined;
  recoverable: boolean;
}> {
  const tree = await getTree();
  const filePath = `content/${collection}/${slug}.md`;
  const fileEntry = tree.tree.find(
    (item) => item.type === "blob" && item.path === filePath,
  );
  if (!fileEntry) {
    throw new Error("No se encontró la publicación solicitada.");
  }
  if (fileEntry.sha !== sha) {
    throw new Error(
      "La publicación cambió en GitHub. Recargá antes de eliminar.",
    );
  }

  const entry = await readEntryBySlug(collection, slug);

  const deletedAt = new Date().toISOString();
  const deletedStamp = deletedAt
    .replace(/[-:.]/g, "")
    .replace("T", "-")
    .replace(/Z$/, "");
  const deletedSlug = `${slug}-deleted-${deletedStamp}`;
  const trashFilePath = `content/${collection}/.deleted/${deletedSlug}.md`;

  const trashFields = {
    ...entry.fields,
    deleted: true,
    deletedAt,
    deletedReason: "Eliminado desde el panel editorial",
    deletedSlug: slug,
    deletedCollection: collection,
    deletedBy: "editor",
  };
  const trashBody = `---\n${stringify(trashFields, { lineWidth: 0 }).trimEnd()}\n---\n\n${entry.body}\n`;

  // Escribir en la papelera
  await writeMarkdownFile(
    collection,
    `.deleted/${deletedSlug}`,
    trashFields,
    trashBody,
  );

  // Borrar el archivo original
  const fileCommit = await deleteMarkdownFile(collection, slug, fileEntry.sha);

  invalidateTreeCache();

  return {
    file: filePath,
    trashed: trashFilePath,
    mediaDeleted: [],
    mediaTrashed: [],
    mediaDeleteFailed: [],
    mediaKept: [],
    commit: fileCommit.commit,
    recoverable: true,
  };
}
