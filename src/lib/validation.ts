import { z } from 'zod';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Editorial score dimensions, each one from 1 to 10. */
const scoreDetailsShape = z.strictObject({
  story: z.number().int().min(1).max(10).optional(),
  gameplay: z.number().int().min(1).max(10).optional(),
  visual: z.number().int().min(1).max(10).optional(),
});

/**
 * Short bullet list, used for the pros and the cons of a review.
 *
 * The limits mirror the database constraints: at most five items and at most
 * 200 characters per item.
 */
const bulletListShape = z
  .array(z.string().trim().min(1, 'El punto no puede estar vacío.').max(200))
  .max(5, 'Máximo 5 puntos.')
  .default([]);

/** Identifiers of the images of the structured gallery. */
const galleryShape = z
  .array(z.number().int().positive())
  .max(20, 'Máximo 20 imágenes en la galería.')
  .default([])
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'No se puede repetir una imagen en la galería.',
  });

/** Absolute URL that uses http or https. */
const httpUrlShape = z.url().refine((value) => /^https?:\/\//i.test(value), {
  message: 'La URL debe usar http:// o https://.',
});

const baseArticle = z.object({
  slug: z.string().regex(SLUG_RE, 'Solo minúsculas, números y guiones.').or(z.literal('')),
  title: z.string().trim().max(120).default(''),
  description: z.string().trim().max(240).default(''),
  body: z.string().max(100_000).default(''),
  author: z.string().trim().max(60).nullable().optional(),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(5)
    .default([])
    .superRefine((tags, ctx) => {
      const normalized = tags.map((tag) => tag.toLocaleLowerCase('es'));
      if (new Set(normalized).size !== normalized.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'No se pueden repetir etiquetas.',
        });
      }
    }),
  coverMediaId: z.number().int().positive().nullable().optional(),
  coverAlt: z.string().trim().max(200).nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  publishedAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((val) => (val ? new Date(val) : null)),
  featured: z.boolean().default(false),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(160).nullable().optional(),
  ogMediaId: z.number().int().positive().nullable().optional(),
  pros: bulletListShape,
  cons: bulletListShape,
  videoUrl: httpUrlShape.nullable().optional(),
  videoTitle: z.string().trim().max(200).nullable().optional(),
  gallery: galleryShape,
});

const reviewShape = baseArticle.extend({
  kind: z.literal('review'),
  gameId: z.number().int().positive().nullable().optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  scoreDetails: scoreDetailsShape
    .refine(
      (details) => Object.values(details).some((value) => value !== undefined),
      'Completá al menos una nota.'
    )
    .nullable()
    .optional(),
  scoreReason: z.string().trim().max(2000).nullable().optional(),
  verdict: z.string().trim().max(500).nullable().optional(),
});

const newsShape = baseArticle.extend({
  kind: z.literal('news'),
  category: z.string().trim().max(40).nullable().optional(),
  sourceName: z.string().trim().max(120).nullable().optional(),
  sourceUrl: httpUrlShape.nullable().optional(),
});

const guideShape = baseArticle.extend({ kind: z.literal('guide') });

export const makeArticleSchema = () =>
  z.discriminatedUnion('kind', [reviewShape, newsShape, guideShape]).superRefine((value, ctx) => {
    if (value.coverMediaId && !value.coverAlt?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['coverAlt'],
        message: 'La portada necesita texto alternativo.',
      });
    }

    // The video needs a title to be announced by the screen readers.
    if (value.videoUrl && !value.videoTitle?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['videoTitle'],
        message: 'El video necesita un título.',
      });
    }
    if (value.videoTitle && !value.videoUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['videoUrl'],
        message: 'El título del video necesita una URL.',
      });
    }

    const publishing = value.status === 'published';
    if (!publishing) return;

    if (value.title.trim().length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['title'],
        message: 'El título necesita al menos 3 caracteres.',
      });
    }
    if (!value.slug) {
      ctx.addIssue({
        code: 'custom',
        path: ['slug'],
        message: 'Una publicación necesita slug.',
      });
    }
    if (value.body.trim().length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'El cuerpo necesita al menos 10 caracteres.',
      });
    }
    if (!value.publishedAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Una publicación necesita fecha.',
      });
    }

    if (value.kind === 'review') {
      if (!value.gameId) {
        ctx.addIssue({
          code: 'custom',
          path: ['gameId'],
          message: 'Elegí un juego.',
        });
      }
      if (value.score == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['score'],
          message: 'Falta la puntuación.',
        });
      }
      if (!value.scoreReason || value.scoreReason.trim().length < 20) {
        ctx.addIssue({
          code: 'custom',
          path: ['scoreReason'],
          message: 'Justificá la puntuación (mínimo 20).',
        });
      }
      if (!value.verdict || value.verdict.trim().length < 10) {
        ctx.addIssue({
          code: 'custom',
          path: ['verdict'],
          message: 'El veredicto necesita al menos 10 caracteres.',
        });
      }
    }
  });

export type ArticleInput = z.input<ReturnType<typeof makeArticleSchema>>;
export type ParsedArticle = z.output<ReturnType<typeof makeArticleSchema>>;

/** A list of short labels: platforms, genres or editorial tags. */
const labelListShape = z
  .array(z.string().trim().min(1).max(30))
  .max(8, 'Máximo 8 valores.')
  .default([])
  .superRefine((values, ctx) => {
    const normalized = values.map((value) => value.toLocaleLowerCase('es'));
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'No se pueden repetir valores.',
      });
    }
  });

/**
 * Schema of a game sheet.
 *
 * The rules mirror the database constraints: a published game needs a cover
 * and a title of at least three characters.
 */
export const makeGameSchema = () =>
  z
    .object({
      slug: z.string().regex(SLUG_RE, 'Solo minúsculas, números y guiones.'),
      title: z.string().trim().min(3, 'El título necesita al menos 3 caracteres.').max(120),
      description: z.string().trim().max(240).default(''),
      body: z.string().max(20_000).default(''),
      developer: z.string().trim().max(80).nullable().optional(),
      publisher: z.string().trim().max(80).nullable().optional(),
      releaseDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.')
        .nullable()
        .optional()
        .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null)),
      platforms: labelListShape,
      genres: labelListShape,
      tags: labelListShape,
      featured: z.boolean().default(false),
      coverMediaId: z.number().int().positive().nullable().optional(),
      coverAlt: z.string().trim().max(200).nullable().optional(),
      status: z.enum(['draft', 'published']).default('draft'),
    })
    .superRefine((value, ctx) => {
      if (value.coverMediaId && !value.coverAlt?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['coverAlt'],
          message: 'La portada necesita texto alternativo.',
        });
      }
      if (value.status === 'published' && !value.coverMediaId) {
        ctx.addIssue({
          code: 'custom',
          path: ['coverMediaId'],
          message: 'Un juego publicado necesita una portada.',
        });
      }
    });

export type GameInput = z.input<ReturnType<typeof makeGameSchema>>;
export type ParsedGame = z.output<ReturnType<typeof makeGameSchema>>;

/** Schema of the editable fields of a media asset. */
export const makeMediaSchema = () =>
  z
    .object({
      alt: z.string().trim().max(200).nullable().optional(),
      credit: z.string().trim().max(120).nullable().optional(),
      rights: z.enum(['own', 'press', 'third_party']),
      sourceUrl: httpUrlShape.nullable().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.rights !== 'own' && !value.credit?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['credit'],
          message: 'Los derechos de terceros necesitan un crédito.',
        });
      }
    });

export type MediaInput = z.input<ReturnType<typeof makeMediaSchema>>;
