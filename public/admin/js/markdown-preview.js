const EMPTY_PREVIEW = "<p class=\"preview-empty\">Sin contenido...</p>";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function safePreviewUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.startsWith("//")) return null;

  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://netti.test";
    const url = new URL(candidate, origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.origin !== origin && !/^https:\/\//i.test(candidate)) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Renderiza una vista previa deliberadamente acotada del Markdown editorial.
 * El HTML escrito por el usuario siempre se escapa; no se permiten etiquetas
 * HTML arbitrarias ni esquemas URL ejecutables dentro de la vista previa.
 */
export function renderMarkdownPreview(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) return EMPTY_PREVIEW;

  let html = escapeHtml(markdown)
    .replace(/^### (.*)$/gim, "<h3>$1</h3>")
    .replace(/^## (.*)$/gim, "<h2>$1</h2>")
    .replace(/^# (.*)$/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, rawUrl) => {
    const url = safePreviewUrl(rawUrl);
    if (!url) return alt;
    return `<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" style="max-width:100%;border-radius:.5rem;margin:1rem 0">`;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, rawUrl) => {
    const url = safePreviewUrl(rawUrl);
    if (!url) return label;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  return html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<h[1-3]>/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}
