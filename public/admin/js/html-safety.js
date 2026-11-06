const MEDIA_PATH_PATTERN = /^\/media\/(?:games|reviews|news|guides)\/[a-z0-9-]+\/[a-z0-9-]+\.(?:webp|avif|png|jpe?g|gif)$/i;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function safeMediaUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/media/")) return "";
  try {
    const url = new URL(value, "https://netti.invalid");
    if (url.origin !== "https://netti.invalid" || !MEDIA_PATH_PATTERN.test(url.pathname)) return "";
    return url.pathname;
  } catch {
    return "";
  }
}
