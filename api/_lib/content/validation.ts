import {
  editorialTagValues,
  imageAltRequired,
  requiredFields,
  textLimits,
  type EditorialCollection,
} from "../../../src/lib/editorial-contract.js";

const editorialTagOptions = new Set<string>(editorialTagValues);

function allowedSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    value.length <= 80
  );
}

function safeImagePath(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return (
    /^\/(?:media|images)\//.test(value) &&
    !value.includes("\\") &&
    !value.toLowerCase().includes("%2e") &&
    !value.split("/").includes("..") &&
    /\.(?:svg|webp|avif|png|jpe?g|gif)$/i.test(value)
  );
}

function validateRequiredFields(
  collection: string,
  fields: Record<string, unknown>,
): string | undefined {
  const keys = requiredFields[collection as EditorialCollection] ?? [];
  for (const key of keys) {
    const value = fields[key];
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return `El campo "${key}" es obligatorio.`;
    }
  }
  return undefined;
}

function validateTextLimits(
  fields: Record<string, unknown>,
): string | undefined {
  for (const [key, [min, max]] of Object.entries(textLimits)) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") return `"${key}" debe ser texto.`;
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
      return `"${key}" debe tener entre ${min} y ${max} caracteres.`;
    }
    fields[key] = trimmed;
  }
  return undefined;
}

function validateGamesFields(
  collection: string,
  fields: Record<string, unknown>,
): string | undefined {
  if (collection !== "games") return undefined;
  const releaseYear = fields.releaseYear;
  if (
    typeof releaseYear !== "number" ||
    !Number.isInteger(releaseYear) ||
    releaseYear < 1970 ||
    releaseYear > 2100
  ) {
    return "El año debe ser un entero entre 1970 y 2100.";
  }
  for (const key of ["platforms", "genres"]) {
    const value = fields[key];
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.length > 20 ||
      value.some(
        (item: unknown) =>
          typeof item !== "string" || !item.trim() || item.trim().length > 60,
      )
    ) {
      return `"${key}" debe contener entre 1 y 20 valores de hasta 60 caracteres.`;
    }
    fields[key] = value.map((item: string) => item.trim());
  }
  return undefined;
}

function validateReviewsFields(
  fields: Record<string, unknown>,
): string | undefined {
  const score = fields.score;
  if (
    typeof score !== "number" ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 100
  ) {
    return "La puntuación debe ser un entero entre 1 y 100.";
  }
  if (fields.scoreDetails !== undefined) {
    const details = fields.scoreDetails;
    const validKeys = ["story", "gameplay", "visual"];
    if (
      !details ||
      typeof details !== "object" ||
      Array.isArray(details) ||
      Object.keys(details).some((key) => !validKeys.includes(key)) ||
      !Object.values(details).some((value) => value !== undefined) ||
      Object.values(details).some(
        (value) =>
          !Number.isInteger(value) || Number(value) < 1 || Number(value) > 10,
      )
    ) {
      return "Las subpuntuaciones deben ser enteros entre 1 y 10 para historia, jugabilidad o apartado visual.";
    }
  }
  return undefined;
}

function validateTags(fields: Record<string, unknown>): string | undefined {
  if (fields.tags !== undefined) {
    if (
      !Array.isArray(fields.tags) ||
      fields.tags.length > 12 ||
      fields.tags.some(
        (tag: unknown) =>
          typeof tag !== "string" || !editorialTagOptions.has(tag),
      ) ||
      new Set(fields.tags).size !== fields.tags.length
    ) {
      return "Las etiquetas deben elegirse de las opciones disponibles y no repetirse.";
    }
  }
  return undefined;
}

function validateProsCons(fields: Record<string, unknown>): string | undefined {
  for (const key of ["pros", "cons"]) {
    if (
      fields[key] !== undefined &&
      (!Array.isArray(fields[key]) ||
        fields[key].length > 5 ||
        fields[key].some(
          (item: unknown) =>
            typeof item !== "string" ||
            !item.trim() ||
            item.trim().length > 200,
        ))
    ) {
      return `"${key}" debe contener hasta 5 textos de 1 a 200 caracteres.`;
    }
    if (Array.isArray(fields[key])) {
      fields[key] = fields[key].map((item: string) => item.trim());
    }
  }
  return undefined;
}

function validateGameRef(fields: Record<string, unknown>): string | undefined {
  if (
    fields.game !== undefined &&
    fields.game !== "" &&
    (typeof fields.game !== "string" || !allowedSlug(fields.game))
  ) {
    return "El juego relacionado no es un slug válido.";
  }
  return undefined;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysPerMonth[month - 1];
}

function validateDates(fields: Record<string, unknown>): string | undefined {
  for (const key of ["publishedAt", "updatedAt"]) {
    if (fields[key] !== undefined && fields[key] !== "") {
      if (typeof fields[key] !== "string" || !isCalendarDate(fields[key])) {
        return `"${key}" debe tener una fecha real con formato AAAA-MM-DD.`;
      }
    }
  }
  return undefined;
}

function validateImages(fields: Record<string, unknown>): string | undefined {
  for (const key of ["coverImage", "heroImage"]) {
    if (fields[key] && !safeImagePath(fields[key])) {
      return `"${key}" debe apuntar a una imagen local bajo /media/ o /images/.`;
    }
  }
  return undefined;
}

const altTextMessages: Record<string, string> = {
  coverImage: "La portada necesita texto alternativo.",
  heroImage: "La imagen panorámica necesita texto alternativo.",
};

function validateAltTexts(fields: Record<string, unknown>): string | undefined {
  for (const [imageField, altFields] of Object.entries(imageAltRequired)) {
    if (!fields[imageField]) continue;
    for (const altField of altFields) {
      if (typeof fields[altField] !== "string" || !fields[altField].trim()) {
        return (
          altTextMessages[imageField] ??
          `"${imageField}" necesita texto alternativo.`
        );
      }
    }
  }
  return undefined;
}

function validateURLs(fields: Record<string, unknown>): string | undefined {
  for (const key of ["videoUrl", "sourceUrl"]) {
    const value = fields[key];
    if (typeof value === "string" && value) {
      try {
        if (!["http:", "https:"].includes(new URL(value).protocol)) {
          return `"${key}" debe usar HTTP o HTTPS.`;
        }
      } catch {
        return `"${key}" debe ser una URL válida.`;
      }
    }
  }
  return undefined;
}

function validateGallery(fields: Record<string, unknown>): string | undefined {
  const gallery = fields.gallery;
  if (gallery !== undefined) {
    if (!Array.isArray(gallery) || gallery.length > 20) {
      return "La galería debe ser una lista de hasta 20 imágenes locales.";
    }
    const valid = gallery.every(
      (item: { src: string; alt?: string; caption?: string }) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        safeImagePath(item.src) &&
        (item.alt === undefined ||
          (typeof item.alt === "string" && item.alt.length <= 240)) &&
        (item.caption === undefined ||
          (typeof item.caption === "string" && item.caption.length <= 240)),
    );
    if (!valid)
      return "La galería debe ser una lista de hasta 20 imágenes locales.";
    fields.gallery = gallery.map(
      (item: { src: string; alt?: string; caption?: string }) => ({
        src: item.src,
        ...(item.alt?.trim() ? { alt: item.alt.trim() } : {}),
        ...(item.caption ? { caption: item.caption.trim() } : {}),
      }),
    );
  }
  return undefined;
}

function validateBody(body: string): string | undefined {
  if (typeof body !== "string" || !body.trim()) {
    return "El cuerpo del artículo es obligatorio.";
  }
  if (body.length > 200000) {
    return "El cuerpo del artículo supera el tamaño permitido.";
  }
  return undefined;
}

function validateInlineImages(body: string): string | undefined {
  for (const [, attributes] of body.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/(?:^|\s)alt\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(attributes)) {
      return "Cada imagen inline debe incluir un atributo alt.";
    }
    if (
      !/(?:^|\s)width\s*=\s*(?:"[1-9]\d*"|'[1-9]\d*'|[1-9]\d*)/i.test(
        attributes,
      ) ||
      !/(?:^|\s)height\s*=\s*(?:"[1-9]\d*"|'[1-9]\d*'|[1-9]\d*)/i.test(
        attributes,
      )
    ) {
      return "Cada imagen inline debe incluir width y height para evitar saltos de diseño.";
    }
  }
  return undefined;
}

function validateInlineMedia(body: string): string | undefined {
  for (const match of body.matchAll(/<(video|audio)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase();
    const attributes = match[2];
    if (!/(?:^|\s)controls(?=\s|=|$)/i.test(attributes)) {
      return `El elemento <${tag}> debe incluir controles.`;
    }
    if (
      !/(?:^|\s)aria-label\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)/i.test(attributes)
    ) {
      return `El elemento <${tag}> debe incluir aria-label.`;
    }
    if (/(?:^|\s)autoplay(?=\s|=|$)/i.test(attributes)) {
      return "Los medios inline no pueden reproducirse automáticamente.";
    }
  }
  return undefined;
}

export function validate(
  collection: string,
  fields: Record<string, unknown>,
  body: string,
): string | undefined {
  const validators: ((
    fields: Record<string, unknown>,
  ) => string | undefined)[] = [
    validateRequiredFields.bind(null, collection),
    validateTextLimits,
    validateGamesFields.bind(null, collection),
    (fields) =>
      collection === "reviews" ? validateReviewsFields(fields) : undefined,
    validateTags,
    validateProsCons,
    validateGameRef,
    validateDates,
    validateImages,
    validateAltTexts,
    validateURLs,
    validateGallery,
  ];
  for (const validator of validators) {
    const error = validator(fields);
    if (error) return error;
  }
  const bodyError = validateBody(body);
  if (bodyError) return bodyError;
  const inlineImageError = validateInlineImages(body);
  if (inlineImageError) return inlineImageError;
  const inlineMediaError = validateInlineMedia(body);
  if (inlineMediaError) return inlineMediaError;
  return undefined;
}
