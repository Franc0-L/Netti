import { marked } from "marked";
import { fromHtml } from "hast-util-from-html";
import { sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { markdownSanitizeSchema } from "./markdown-schema";
import { resolveImageUrl } from "./image-url";

/*
  Renderiza el cuerpo Markdown de una publicación y reescribe las rutas de
  imagen para que apunten al endpoint `/media/...` del sitio.
  `marked` no sanitiza por sí solo: el HTML se limpia con el mismo esquema que
  usa Astro para los archivos Markdown, así ambos caminos permiten el mismo
  subconjunto de HTML.
*/
export function renderMarkdown(body: string): string {
  const html = marked.parse(body, { async: false }) as string;

  const withMediaUrls = html.replace(
    /(\s(?:src|poster)\s*=\s*)(["'])(\/[^"']*)\2/gi,
    (_match, attribute: string, quote: string, url: string) =>
      `${attribute}${quote}${resolveImageUrl(url)}${quote}`,
  );

  // `hast-util-sanitize` opera directamente sobre el árbol hast, sin necesidad
  // de envolverlo en un procesador `unified` ni de castear tipos.
  const tree = fromHtml(withMediaUrls, { fragment: true });
  return toHtml(sanitize(tree, markdownSanitizeSchema));
}
