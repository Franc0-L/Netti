import { marked } from "marked";
import { unified } from "unified";
import { fromHtml } from "hast-util-from-html";
import rehypeSanitize from "rehype-sanitize";
import { toHtml } from "hast-util-to-html";
import { markdownSanitizeSchema } from "./markdown-schema";
import { resolveImageUrl } from "./image-url";

/*
  Sanitiza el HTML resultante de `marked` con el mismo esquema que usa Astro
  para los archivos Markdown. `marked` no sanitiza por sí solo: sin este paso,
  cualquier HTML del cuerpo editorial se inyectaba tal cual en la página.
*/
const sanitize = unified().use(rehypeSanitize, markdownSanitizeSchema);

// Renderiza el cuerpo Markdown de una publicación y reescribe las rutas de imagen para que apunten al endpoint `/media/...` del sitio.
export function renderMarkdown(body: string): string {
  const html = marked.parse(body, { async: false }) as string;

  const withMediaUrls = html.replace(
    /(\s(?:src|poster)\s*=\s*)(["'])(\/[^"']*)\2/gi,
    (_match, attribute: string, quote: string, url: string) =>
      `${attribute}${quote}${resolveImageUrl(url)}${quote}`,
  );

  // `fromHtml` y `toHtml` son utilidades de hast, no plugins de unified.
  const tree = fromHtml(withMediaUrls, { fragment: true });
  const sanitized = sanitize.runSync(tree as never);
  return toHtml(sanitized as never);
}
