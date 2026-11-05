import type { APIRoute } from "astro";
import { serverEnv } from "../../lib/env";

// Sirve las imágenes editoriales que viven en el repositorio privado Contenido-Netti.
const REPO = serverEnv("CONTENT_GITHUB_REPO") || "Franc0-L/Contenido-Netti";
const TOKEN = serverEnv("CONTENT_GITHUB_TOKEN");
const REF = "main";
const MAX_BYTES = 6 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;

const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/*
    Magic bytes (números mágicos) por extensión de imagen. Se usan para verificar que el contenido sea realmente una imagen del tipo
    declarado y no un archivo con extensión falsa.
*/
const MAGIC_BYTES: Record<string, Buffer[]> = {
  jpg: [Buffer.from([0xff, 0xd8, 0xff])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  gif: [Buffer.from([0x47, 0x49, 0x46, 0x38])], // GIF8
};

const RIFF = Buffer.from([0x52, 0x49, 0x46, 0x46]); // "RIFF"
const WEBP = Buffer.from([0x57, 0x45, 0x42, 0x50]); // "WEBP"
const FTYP = Buffer.from([0x66, 0x74, 0x79, 0x70]); // "ftyp"
const AVIF = Buffer.from([0x61, 0x76, 0x69, 0x66]); // "avif"
const AVIS = Buffer.from([0x61, 0x76, 0x69, 0x73]); // "avis"

/*
    Verifica que los bytes del archivo coincidan con la firma esperada. WebP y AVIF necesitan comprobar campos en
    offsets específicos: mirar solo `RIFF` aceptaría cualquier archivo RIFF (por ejemplo, un WAV) como WebP.
*/
function hasValidMagicBytes(bytes: Buffer, extension: string): boolean {
  const ext = extension.toLowerCase();

  if (ext === "webp") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).equals(RIFF) &&
      bytes.subarray(8, 12).equals(WEBP)
    );
  }

  if (ext === "avif") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(4, 8).equals(FTYP) &&
      (bytes.subarray(8, 12).equals(AVIF) || bytes.subarray(8, 12).equals(AVIS))
    );
  }

  const expected = MAGIC_BYTES[ext];
  if (!expected) return false;

  return expected.some(
    (magic) =>
      bytes.length >= magic.length &&
      bytes.subarray(0, magic.length).equals(magic),
  );
}

const cache = new Map<
  string,
  { bytes: Buffer; contentType: string; expiresAt: number }
>();

export const prerender = false;

function tooManyCached() {
  return cache.size >= MAX_CACHE_ENTRIES;
}

function storeInCache(path: string, bytes: Buffer, contentType: string) {
  if (tooManyCached()) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(path, {
    bytes,
    contentType,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function notFound() {
  return new Response("Imagen no encontrada", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Convierte el parámetro de ruta en una ruta de repositorio segura. Solo se permiten medios bajo `media/{games,reviews,news,guides}/...`.
function safeRepoPath(raw: string): string | null {
  let value = raw;

  try {
    // Astro suele entregar el parámetro ya decodificado; decodificamos solo cuando queda algún escape para no romper nombres legítimos.
    if (/%[0-9a-f]{2}/i.test(value)) value = decodeURIComponent(value);
  } catch {
    return null;
  }

  value = value.replace(/^\/+/, "");

  if (value.includes("\\") || value.includes("\0")) return null;

  const segments = value.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  const fullPath = `media/${value}`.replace(/^media\/media\//, "media/");
  const match = fullPath.match(
    /^media\/(games|reviews|news|guides)\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|jpeg|png|webp|gif|avif)$/,
  );

  if (!match) return null;

  return fullPath;
}

export const GET: APIRoute = async ({ params }) => {
  const repoPath = safeRepoPath(params.path ?? "");
  if (!repoPath) return notFound();

  const cachedEntry = cache.get(repoPath);
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return new Response(new Uint8Array(cachedEntry.bytes), {
      headers: {
        "Content-Type": cachedEntry.contentType,
        "Content-Length": String(cachedEntry.bytes.length),
        "Cache-Control":
          "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400",
      },
    });
  }

  if (!TOKEN) {
    return new Response("El servicio de medios no está configurado", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=${REF}`,
      {
        headers: {
          Accept: "application/vnd.github.raw",
          Authorization: `Bearer ${TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Netti-media",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) return notFound();

    const length = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > MAX_BYTES) {
      return new Response("La imagen supera el tamaño permitido", {
        status: 413,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return notFound();

    const extension = repoPath.split(".").pop()?.toLowerCase();
    if (!extension || !hasValidMagicBytes(bytes, extension)) {
      return notFound();
    }

    const headerType = response.headers.get("content-type")?.split(";")[0];
    const contentType =
      headerType?.startsWith("image/") === true
        ? headerType
        : (contentTypes[extension] ?? "application/octet-stream");

    storeInCache(repoPath, bytes, contentType);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control":
          "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400",
      },
    });
  } catch {
    return notFound();
  } finally {
    clearTimeout(timer);
  }
};
