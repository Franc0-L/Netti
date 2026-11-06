import { safeMediaUrl } from "./html-safety.js";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export function validateImageFile(file) {
  if (!file || typeof file !== "object") return "Seleccioná una imagen.";
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Formato no admitido. Usá PNG, JPEG, WebP, GIF o AVIF.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "El archivo está vacío o no es válido.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "La imagen no puede superar los 2 MB.";
  }
  return "";
}

export async function encodeImageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function uploadImageFile({ api, file, collection, slug, alt = "" }) {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);
  if (typeof alt === "string" && alt.length > 240) {
    throw new Error("El texto alternativo no puede superar los 240 caracteres.");
  }
  if (typeof file.name === "string" && file.name.length > 255) {
    throw new Error("El nombre del archivo es demasiado largo.");
  }
  if (!api || typeof api.post !== "function") {
    throw new TypeError("Falta un cliente válido para subir la imagen.");
  }

  const data = await api.post("/upload", {
    collection,
    slug,
    mimeType: file.type,
    filename: file.name,
    alt: alt || file.name,
    data: await encodeImageFile(file),
  });
  const url = safeMediaUrl(data?.url);
  if (!url) throw new Error("El servidor devolvió una ruta de imagen no válida.");
  return { ...data, url };
}
