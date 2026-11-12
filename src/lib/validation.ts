import { z } from 'zod';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
});

const reviewShape = baseArticle.extend({
  kind: z.literal('review'),
  gameId: z.number().int().positive().nullable().optional(),
  score: z.number().int().min(1).max(10).nullable().optional(),
  scoreReason: z.string().trim().max(2000).nullable().optional(),
  verdict: z.string().trim().max(500).nullable().optional(),
});

const newsShape = baseArticle.extend({
  kind: z.literal('news'),
  category: z.string().trim().max(40).nullable().optional(),
  sourceName: z.string().trim().max(120).nullable().optional(),
  sourceUrl: z
    .url()
    .refine((value) => /^https?:\/\//i.test(value), {
      message: 'La fuente debe usar http:// o https://.',
    })
    .nullable()
    .optional(),
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
