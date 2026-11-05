import { marked } from "marked";
import { resolveImageUrl } from "./image-url";

// Renderiza el cuerpo Markdown de una publicación y reescribe las rutas de imagen para que apunten al endpoint `/media/...` del sitio.
export function renderMarkdown(body: string): string {
  const html = marked.parse(body, { async: false }) as string;

  return html.replace(
    /(\s(?:src|poster)\s*=\s*)(["'])(\/[^"']*)\2/gi,
    (_match, attribute: string, quote: string, url: string) =>
      `${attribute}${quote}${resolveImageUrl(url)}${quote}`,
  );
}
