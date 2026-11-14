# Validación con Zod — Netti

Los esquemas viven en `lib/validation.ts`. **No se importan directamente en el cliente**: se construyen con fábricas sin parámetros, porque las URLs de imágenes se resuelven en el servidor desde `media`, no se reciben desde el cliente.

## 1. `imageUrlSchema` — eliminado

No existe `imageUrlSchema` como función pública. Las URLs de imagen no entran desde el cliente: solo `coverMediaId` y `ogMediaId` (IDs numéricos de `media`) son aceptados. El servidor resuelve las URLs públicas desde la tabla `media`.

## 2. Esquema de artículo (`makeArticleSchema`)

Todo lo que sigue vive dentro de `makeArticleSchema()`, que construye el esquema de validación de entradas del cliente. No recibe parámetros.

```ts
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Editorial score dimensions, each one from 1 to 10. */
const scoreDetailsShape = z.strictObject({
  story: z.number().int().min(1).max(10).optional(),
  gameplay: z.number().int().min(1).max(10).optional(),
  visual: z.number().int().min(1).max(10).optional(),
});

/** Pros and cons: at most five items of at most 200 characters. */
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

export const makeArticleSchema = () => {
  // Campos comunes a las tres colecciones. Un borrador puede dejarlos vacíos.
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
          ctx.addIssue({ code: 'custom', message: 'No se pueden repetir etiquetas.' });
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

  const articleSchema = z
    .discriminatedUnion('kind', [reviewShape, newsShape, guideShape])
    .superRefine((value, ctx) => {
      if (value.coverMediaId && !value.coverAlt?.trim())
        ctx.addIssue({
          code: 'custom',
          path: ['coverAlt'],
          message: 'La portada necesita texto alternativo.',
        });

      const publishing = value.status === 'published';
      if (!publishing) return;

      if (value.title.trim().length < 3)
        ctx.addIssue({
          code: 'custom',
          path: ['title'],
          message: 'El título necesita al menos 3 caracteres.',
        });
      if (!value.slug)
        ctx.addIssue({ code: 'custom', path: ['slug'], message: 'Una publicación necesita slug.' });
      if (value.body.trim().length < 10)
        ctx.addIssue({
          code: 'custom',
          path: ['body'],
          message: 'El cuerpo necesita al menos 10 caracteres.',
        });
      if (!value.publishedAt)
        ctx.addIssue({
          code: 'custom',
          path: ['publishedAt'],
          message: 'Una publicación necesita fecha.',
        });

      if (value.kind === 'review') {
        if (!value.gameId)
          ctx.addIssue({ code: 'custom', path: ['gameId'], message: 'Elegí un juego.' });
        if (value.score == null)
          ctx.addIssue({ code: 'custom', path: ['score'], message: 'Falta la puntuación.' });
        if (!value.scoreReason || value.scoreReason.trim().length < 20)
          ctx.addIssue({
            code: 'custom',
            path: ['scoreReason'],
            message: 'Justificá la puntuación (mínimo 20).',
          });
        if (!value.verdict || value.verdict.trim().length < 10)
          ctx.addIssue({
            code: 'custom',
            path: ['verdict'],
            message: 'El veredicto necesita al menos 10 caracteres.',
          });
      }
    });

  return articleSchema;
};

export type ArticleInput = z.input<ReturnType<typeof makeArticleSchema>>;
export type ParsedArticle = z.output<ReturnType<typeof makeArticleSchema>>;
```

`coverMediaId` y `ogMediaId` son los únicos campos de entrada para imágenes; el servidor resuelve las URLs públicas desde `media`. `coverImageUrl` y `ogImageUrl` en la base son caché derivado, no entrada del cliente.

El `kind` es un literal por variante, así que `discriminatedUnion` estrecha el tipo: en `value.kind === "review"`, `gameId` y `score` existen en el tipo. Los campos de reseña son nullable para que un borrador incompleto sea válido; la exigencia aparece al publicar, en el mismo lugar que los `CHECK` de la base.

La puntuación va de **0 a 100** y el desglose editorial (`scoreDetails`) usa dimensiones de **1 a 10**, con al menos una informada y sin claves desconocidas (`strictObject`). La rareza no se valida en Zod: no la escribe la aplicación, la deriva el trigger de la base a partir del score.

`sourceUrl` y `videoUrl` usan `httpUrlShape`, que exige `http://` o `https://` sin distinguir mayúsculas, igual que los `CHECK` (`~*`). Si Zod fuera más laxo, `HTTPS://x` pasaría la validación y fallaría en la base con un `500`.

El video se valida en pareja: si hay URL, el título es obligatorio (es lo que anuncia el lector de pantalla), y si hay título, la URL también. La galería admite hasta 20 ids de `media` sin repetir; el servidor comprueba además que existan y que no estén marcados para eliminación.

### 3. `makeGameSchema`

La base exige `slug` y `title` desde el insert (los `CHECK` de `games` no admiten vacío), así que un juego borrador no puede estar vacío (a diferencia de `articles`).

```ts
// lib/validation.ts
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A list of short labels: platforms, genres or editorial tags. */
const labelListShape = z
  .array(z.string().trim().min(1).max(30))
  .max(8, 'Máximo 8 valores.')
  .default([])
  .superRefine((values, ctx) => {
    const normalized = values.map((value) => value.toLocaleLowerCase('es'));
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({ code: 'custom', message: 'No se pueden repetir valores.' });
    }
  });

export const makeGameSchema = () =>
  z
    .object({
      slug: z.string().regex(SLUG_RE, 'Solo minúsculas, números y guiones.'),
      title: z.string().trim().min(3).max(120),
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
```

Plataformas, géneros y etiquetas comparten el mismo esquema: hasta ocho valores de 30 caracteres, sin repetir (la comparación no distingue mayúsculas, como `toLocaleLowerCase('es')`). La fecha de lanzamiento se envía como `AAAA-MM-DD` y se transforma a `Date` en UTC: el panel y la ficha muestran solo la fecha, sin zona horaria ambigua.

### 3.1 `makeMediaSchema`

Segundo paso después de la subida de imagen. El servidor valida que el medio exista y no esté marcado para eliminación.

```ts
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
```

### 3.2 Constantes de subida

Viven en `src/lib/images.ts`, no en el esquema de Zod: son límites del procesamiento de imágenes.

```ts
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_IMAGE_EDGE = 2560;
export const IMAGE_VARIANT_WIDTHS = [480, 960, 1600] as const;
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
```

El tipo válido se detecta por **magic bytes** (`detectImageType`) y tiene que coincidir con el MIME declarado: un archivo que dice `image/png` pero es otra cosa se rechaza.

El servidor valida, en este orden: tamaño declarado (como pista), tamaño real, MIME, magic numbers, dimensiones decodificadas y megapíxeles. Después re-encodea con `sharp`, que descarta EXIF (incluido GPS) y las estructuras del archivo original, y genera las variantes. `sharp` reduce la superficie de un archivo manipulado; no es una garantía absoluta frente a vulnerabilidades del decodificador, así que la dependencia se mantiene actualizada.

**GIF queda fuera.** La salida es WebP estático y `sharp` descartaría los fotogramas en silencio. Aceptar el formato para luego romper la animación es peor que rechazarlo con un mensaje claro. Si algún día se necesitan animaciones, se decide y se implementa entonces.

### 3.3 Versión de Zod

Se fija Zod 4 en `package.json`. Si se usara Zod 3, el `superRefine` externo sigue siendo la forma correcta; no cambiar la estructura al migrar.

En Zod 4, el _input_ de `z.iso.datetime()` es `unknown`, así que `ArticleInput` pierde el tipo de `publishedAt`. Por eso se usa `.transform((val) => (val ? new Date(val) : null))` para devolver `Date | null`.
