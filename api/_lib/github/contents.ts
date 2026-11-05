import { githubClient, GitHubHttpError } from "./client.js";

// Obtiene el árbol recursivo del repositorio. Devuelve la lista de items (blobs y tree) o lanza GitHubHttpError.
export async function getTree(): Promise<
  { type: string; path: string; sha: string }[]
> {
  const data = await githubClient("/git/trees/main?recursive=1", {
    retries: 3,
  });
  if (!data || !Array.isArray(data.tree)) {
    throw new GitHubHttpError("GitHub no devolvió un índice válido.", 502);
  }
  return data.tree;
}

// Lee un blob de GitHub por su SHA y devuelve el contenido decodificado como string UTF-8. Lanza GitHubHttpError si algo falla.
export async function readBlob(sha: string): Promise<string> {
  const data = await githubClient(`/git/blobs/${sha}`, { retries: 3 });
  if (!data || data.encoding !== "base64" || typeof data.content !== "string") {
    throw new GitHubHttpError(
      "GitHub no devolvió el contenido del archivo.",
      502,
    );
  }
  const buf = Buffer.from(data.content, "base64");
  return buf.toString("utf8");
}

// Lee el frontmatter y cuerpo de un archivo Markdown en el repositorio. Ruta esperada: content/{coleccion}/{slug}.md
export async function readMarkdownFile(
  collection: string,
  slug: string,
): Promise<{ fields: Record<string, unknown>; body: string; sha: string }> {
  const tree = await getTree();
  const item = tree.find(
    (i) => i.type === "blob" && i.path === `content/${collection}/${slug}.md`,
  );
  if (!item) {
    throw new GitHubHttpError(
      `No se encontró la publicación content/${collection}/${slug}.md`,
      404,
    );
  }

  const content = await readBlob(item.sha);
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    throw new GitHubHttpError("El artículo no tiene frontmatter válido.", 400);
  }
  const yaml = require("yaml");
  const fields = yaml.parse(match[1]) || {};
  const body = content.slice(match[0].length).trimStart();
  return { fields, body, sha: item.sha };
}

// Escribe o actualiza un archivo Markdown en el repositorio. Ruta: content/{coleccion}/{slug}.md
export async function writeMarkdownFile(
  collection: string,
  slug: string,
  fields: Record<string, unknown>,
  body: string,
  existingSha?: string,
): Promise<{ commit: string | undefined }> {
  const { stringify } = require("yaml");
  const clean = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== ""),
  );
  const markdown = `---\n${stringify(clean, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;

  const bodyPayload: Record<string, unknown> = {
    message: `content(${collection}): ${existingSha ? "editar" : "crear"} ${slug}`,
    content: Buffer.from(markdown, "utf8").toString("base64"),
    branch: "main",
  };
  if (existingSha) {
    bodyPayload.sha = existingSha;
  }

  const data = await githubClient(
    `/contents/content/${collection}/${slug}.md`,
    {
      method: "PUT",
      body: bodyPayload,
      retries: 3,
    },
  );
  if (!data || !data.commit || typeof data.commit.sha !== "string") {
    throw new GitHubHttpError(
      "GitHub no confirmó la escritura del archivo.",
      502,
    );
  }
  return { commit: data.commit.sha };
}

// Elimina un archivo Markdown del repositorio. Ruta: content/{coleccion}/{slug}.md
export async function deleteMarkdownFile(
  collection: string,
  slug: string,
  sha: string,
): Promise<{ commit: string | undefined }> {
  const data = await githubClient(
    `/contents/content/${collection}/${slug}.md`,
    {
      method: "DELETE",
      body: { sha, branch: "main" },
      retries: 3,
    },
  );
  if (!data || !data.commit || typeof data.commit.sha !== "string") {
    throw new GitHubHttpError(
      "GitHub no confirmó la eliminación del archivo.",
      502,
    );
  }
  return { commit: data.commit.sha };
}

// Escribe un archivo binario (imagen) en el repositorio. Ruta: media/{coleccion}/{slug}/{filename}
export async function writeMediaFile(
  collection: string,
  slug: string,
  filename: string,
  base64Content: string,
): Promise<{ commit: string | undefined; path: string }> {
  const filePath = `media/${collection}/${slug}/${filename}`;
  const data = await githubClient(`/contents/${filePath}`, {
    method: "PUT",
    body: {
      message: `media(upload): ${collection}/${slug}`,
      content: base64Content,
      branch: "main",
    },
    retries: 3,
  });
  if (!data || !data.commit || typeof data.commit.sha !== "string") {
    throw new GitHubHttpError(
      "GitHub no confirmó la subida de la imagen.",
      502,
    );
  }
  return { commit: data.commit.sha, path: filePath };
}

// Elimina un archivo del repositorio.
export async function deleteFile(path: string, sha: string): Promise<void> {
  await githubClient(`/contents/${path}`, {
    method: "DELETE",
    body: { sha, branch: "main" },
    retries: 3,
  });
}
