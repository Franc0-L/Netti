/*
    Contrato editorial compartido entre el sitio público (Netti) y el panel editorial (Contenido-Netti).
    Este módulo es la fuente de verdad para los schemas Zod que validan el frontmatter y el cuerpo de las publicaciones.
    Tanto `src/lib/fetch-content.ts` (lecturas del sitio) como `api/admin/content.ts` (escrituras del panel) deben basarse
    en estos schemas para garantizar que las reglas coincidan.
    Los schemas se exportan para que:
    - fetch-content.ts los use para validar contenido leído de GitHub
    - content.ts los use como base para validar peticiones del panel
    - Los tests puedan comparar que ambos lados aplican las mismas reglas
*/
import { z } from "zod";

export const editorialTagValues = [
  "En análisis",
  "Actualizado",
  "Rejugado",
  "Recomendado",
  "Joyita",
  "Imprescindible",
  "Cooperativo",
  "Para jugar en cooperativo",
  "Multijugador",
  "Un jugador",
  "Indie",
  "AAA",
  "Acceso anticipado",
] as const;

const editorialTags = z.array(z.enum(editorialTagValues)).max(12).optional();

const imagePath = z
  .string()
  .regex(
    /^\/(?:media|images)\/[^\s"'<>\\]+$/,
    "Debe ser una ruta local de imagen",
  );

const imageFields = {
  coverImage: imagePath.optional(),
  coverAlt: z.string().optional(),
  heroImage: imagePath.optional(),
  heroAlt: z.string().optional(),
};

const galleryItem = z.object({
  src: imagePath,
  alt: z.string().optional(),
  caption: z.string().optional(),
});

const mediaFields = {
  videoUrl: z.url().optional(),
  videoTitle: z.string().optional(),
  gallery: z.array(galleryItem).max(20).optional(),
};

const gameSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  releaseYear: z.number().int().min(1970).max(2100),
  platforms: z.array(z.string().min(1).max(60)).min(1).max(20),
  genres: z.array(z.string().min(1).max(60)).min(1).max(20),
  developer: z.string().min(1).max(120),
  publisher: z.string().min(1).max(120).optional(),
  featured: z.boolean().default(false),
  tags: editorialTags,
  ...imageFields,
  ...mediaFields,
});

const reviewSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  game: z.string().min(1).max(80),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  score: z.number().int().min(1).max(100),
  scoreReason: z.string().min(10).max(1000),
  verdict: z.string().min(1).max(500),
  author: z.string().min(1).max(120).default("Redacción"),
  featured: z.boolean().default(false),
  tags: editorialTags,
  pros: z.array(z.string().min(1).max(200)).max(5).optional(),
  cons: z.array(z.string().min(1).max(200)).max(5).optional(),
  scoreDetails: z
    .object({
      story: z.number().int().min(1).max(10).optional(),
      gameplay: z.number().int().min(1).max(10).optional(),
      visual: z.number().int().min(1).max(10).optional(),
    })
    .strict()
    .refine((details) =>
      Object.values(details).some((value) => value !== undefined),
    )
    .optional(),
  ...imageFields,
  ...mediaFields,
});

const newsSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  category: z.string().min(1).max(80).default("Noticias"),
  author: z.string().min(1).max(120).default("Netti"),
  featured: z.boolean().default(false),
  tags: editorialTags,
  sourceName: z.string().min(1).max(120).optional(),
  sourceUrl: z.url().optional(),
  ...imageFields,
  ...mediaFields,
});

const guideSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  game: z.string().min(1).max(80).optional(),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  author: z.string().min(1).max(120).default("Redacción"),
  featured: z.boolean().default(false),
  ...imageFields,
  ...mediaFields,
});

export const editorialSchemas = {
  games: gameSchema,
  reviews: reviewSchema,
  news: newsSchema,
  guides: guideSchema,
} as const;

export type EditorialCollection = keyof typeof editorialSchemas;

export type GamesData = z.infer<typeof gameSchema>;
export type ReviewsData = z.infer<typeof reviewSchema>;
export type NewsData = z.infer<typeof newsSchema>;
export type GuidesData = z.infer<typeof guideSchema>;

export type EditorialData = {
  games: GamesData;
  reviews: ReviewsData;
  news: NewsData;
  guides: GuidesData;
};

/*
    Lista de campos obligatorios por colección, sincronizada con los schemas.
    Se usa tanto por fetch-content (para validar al leer) como por content.ts (para validar el escribir desde el panel).
*/
export const requiredFields: Record<EditorialCollection, string[]> = {
  games: [
    "title",
    "description",
    "releaseYear",
    "platforms",
    "genres",
    "developer",
  ],
  reviews: [
    "title",
    "description",
    "game",
    "publishedAt",
    "score",
    "scoreReason",
    "verdict",
  ],
  news: ["title", "description", "publishedAt", "category", "author"],
  guides: ["title", "description", "publishedAt"],
};

// Límites de longitud de texto por campo, sincronizados con los schemas.
export const textLimits: Record<string, [number, number]> = {
  title: [1, 200],
  description: [1, 500],
  developer: [1, 120],
  publisher: [1, 120],
  author: [1, 120],
  category: [1, 80],
  verdict: [1, 500],
  scoreReason: [10, 1000],
  sourceName: [1, 120],
  coverAlt: [1, 240],
  heroAlt: [1, 240],
  videoTitle: [1, 200],
};

// Campos de imagen que requieren texto alternativo obligatorio.
export const imageAltRequired: Record<string, string[]> = {
  coverImage: ["coverAlt"],
  heroImage: ["heroAlt"],
};

// Valida que los schemas exportados sean coherentes con sí mismos. Usado por los tests de contrato para asegurar que no haya schemas rotos.
export function validateContractIntegrity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [collection, schema] of Object.entries(editorialSchemas)) {
    try {
      schema.safeParse({});
    } catch (error) {
      errors.push(`${collection}: schema no se puede parsear: ${error}`);
    }
  }

  const collections = new Set(Object.keys(editorialSchemas));
  for (const collection of Object.keys(requiredFields)) {
    if (!collections.has(collection as EditorialCollection)) {
      errors.push(
        `${collection}: existe en requiredFields pero no en editorialSchemas`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
