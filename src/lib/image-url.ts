/*
    Resuelve rutas de imagen para la página Netti.
    Las imágenes editoriales viven en el repositorio privado Contenido-Netti (`media/`) y se sirven a 
    través del endpoint propio `/media/...` del sitio. Ese endpoint descarga el archivo con el token del
    servidor, por lo que las URLs de `raw.githubusercontent.com` dejan de ser necesarias (y no funcionan para repositorios privados).
    Las rutas locales del sitio (plataformas, logo, fondo, etc.) se devuelven tal cual, ya que viven en public/ del repo Netti.
*/

const EDITORIAL_PREFIX = "/images/editorial/";
const LEGACY_GAMES_PREFIX = "/images/games/";
const MEDIA_PREFIX = "/media/";

// Normaliza las rutas heredadas del panel (`/images/editorial/...`, `/images/games/...`) a la ruta canónica `/media/...`.
export function normalizeMediaPath(src?: string): string | undefined {
  if (!src) return undefined;

  const value = src.trim();
  if (!value) return undefined;

  // Rutas absolutas externas (YouTube, Vimeo, etc.) se devuelven tal cual.
  if (/^(?:https?:)?\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }

  if (value.startsWith(EDITORIAL_PREFIX)) {
    return `${MEDIA_PREFIX}${value.slice(EDITORIAL_PREFIX.length)}`;
  }

  if (value.startsWith(LEGACY_GAMES_PREFIX)) {
    return `${MEDIA_PREFIX}games/${value.slice(LEGACY_GAMES_PREFIX.length)}`;
  }

  return value;
}

// Indica si la ruta pertenece a los medios del repositorio editorial.
export function isMediaPath(src?: string): boolean {
  return (
    typeof src === "string" &&
    normalizeMediaPath(src)?.startsWith(MEDIA_PREFIX) === true
  );
}

export function resolveImageUrl(src?: string): string | undefined {
  const normalized = normalizeMediaPath(src);
  if (!normalized) return undefined;

  return normalized;
}
