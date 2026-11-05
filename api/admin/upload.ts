import sharp from "sharp";
import {
  assertSameOrigin,
  hasSession,
  json,
  logAdminError,
} from "../_lib/security.js";
import { writeMediaFile } from "../_lib/github/contents.js";

const collections = new Set(["games", "reviews", "news", "guides"]);
const maxBytes = 2 * 1024 * 1024; // 2 MB

const formats: Record<
  string,
  { extension: string; signature: (bytes: Buffer) => boolean }
> = {
  "image/jpeg": {
    extension: "jpg",
    signature: (b) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    signature: (b) =>
      b.length >= 8 &&
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "image/gif": {
    extension: "gif",
    signature: (b) =>
      b.length >= 6 &&
      ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("ascii")),
  },
  "image/webp": {
    extension: "webp",
    signature: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  "image/avif": {
    extension: "avif",
    signature: (b) =>
      b.length >= 12 &&
      (b.subarray(4, 12).toString("ascii").startsWith("ftypavif") ||
        b.subarray(4, 12).toString("ascii").startsWith("ftypavis")),
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Método no permitido." });
  }
  if (!hasSession(req))
    return json(res, 401, { error: "Iniciá sesión para continuar." });
  if (!assertSameOrigin(req))
    return json(res, 403, { error: "Origen no permitido." });

  const contentLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > 3_000_000) {
    return json(res, 413, {
      error: "La solicitud supera el límite permitido para una imagen de 2 MB.",
    });
  }

  try {
    if (typeof req.body === "string" && req.body.length > 3_000_000) {
      return json(res, 413, {
        error:
          "La solicitud supera el límite permitido para una imagen de 2 MB.",
      });
    }
    let input;
    try {
      input = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return json(res, 400, {
        error: "El cuerpo de la solicitud no contiene JSON válido.",
      });
    }
    const {
      collection,
      slug,
      mimeType,
      data,
      alt,
      filename: clientFilename,
    } = input || {};
    if (typeof collection !== "string" || !collections.has(collection)) {
      return json(res, 400, { error: "Colección desconocida." });
    }
    if (
      typeof slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 80
    ) {
      return json(res, 400, {
        error: "El slug de la publicación no es válido.",
      });
    }
    if (alt !== undefined && (typeof alt !== "string" || alt.length > 240)) {
      return json(res, 400, {
        error: "El texto alternativo no puede superar los 240 caracteres.",
      });
    }
    if (
      clientFilename !== undefined &&
      (typeof clientFilename !== "string" ||
        !clientFilename.trim() ||
        clientFilename.length > 255 ||
        clientFilename.includes("/") ||
        clientFilename.includes("\\") ||
        clientFilename.includes("\0"))
    ) {
      return json(res, 400, { error: "El nombre del archivo no es válido." });
    }
    if (typeof mimeType !== "string" || !formats[mimeType]) {
      return json(res, 400, {
        error: "Formato no admitido. Usá PNG, JPEG, WebP, GIF o AVIF.",
      });
    }
    if (typeof data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return json(res, 400, {
        error: "El archivo no tiene una codificación válida.",
      });
    }

    const bytes = Buffer.from(data, "base64");
    if (!bytes.length || bytes.length > maxBytes) {
      return json(res, 400, {
        error: "El archivo está vacío o supera los 2 MB.",
      });
    }
    if (!formats[mimeType].signature(bytes)) {
      return json(res, 400, {
        error: "El contenido del archivo no coincide con el formato declarado.",
      });
    }

    // Optimizar imagen con sharp: convertir a WebP con calidad 80
    let optimizedBytes = bytes;
    let outputExt = formats[mimeType].extension;
    try {
      if (mimeType !== "image/webp") {
        optimizedBytes = await sharp(bytes)
          .webp({ quality: 80 })
          .toBuffer();
        outputExt = "webp";
      }
    } catch {
      // Si sharp falla, usar los bytes originales
    }

    const filename = `${require("node:crypto").randomUUID()}.${outputExt}`;

    const saved = await writeMediaFile(collection, slug, filename, optimizedBytes.toString("base64"));
    if (!saved || typeof saved.commit !== "string") {
      throw new Error("GitHub no confirmó la ruta de la imagen guardada.");
    }

    return json(res, 201, {
      ok: true,
      commit: saved.commit,
      path: saved.path,
      url: `/media/${collection}/${slug}/${filename}`,
      alt:
        typeof alt === "string" && alt.trim()
          ? alt.trim()
          : typeof clientFilename === "string"
            ? clientFilename
                .replace(/\.[^.]+$/, "")
                .replace(/[-_]+/g, " ")
                .trim()
                .slice(0, 240)
            : "",
    });
  } catch (error) {
    logAdminError("media_upload_error", req, error, 502);
    return json(res, 502, {
      error:
        "No se pudo guardar la imagen. Intentá nuevamente y revisá los registros del servidor si el problema continúa.",
    });
  }
}
