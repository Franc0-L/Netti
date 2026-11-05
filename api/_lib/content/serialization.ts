import { parse, stringify } from "yaml";

// Parsea un string Markdown con frontmatter YAML y devuelve los campos y el cuerpo. Lanza Error si no hay frontmatter válido.
export function parseMarkdown(markdown: string): {
  fields: Record<string, unknown>;
  body: string;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n|$/);
  if (!match) {
    throw new Error("El artículo guardado no tiene frontmatter válido.");
  }
  const fields = (parse(match[1]) || {}) as Record<string, unknown>;
  const body = markdown.slice(match[0].length).trimStart();
  return { fields, body };
}

// Serializa campos y cuerpo a un string Markdown con frontmatter YAML. Elimina campos undefined o vacíos antes de escribir.
export function markdownFor(
  fields: Record<string, unknown>,
  body: string,
): string {
  const clean = Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
  return `---\n${stringify(clean, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}
