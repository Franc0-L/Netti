import { cache } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '@/db/index';
import { articles, media, mediaVariants } from '@/db/schema';

export type ArticleKind = 'review' | 'news' | 'guide';

export const visibleArticle = (now: Date = new Date()) =>
  and(eq(articles.status, 'published'), lte(articles.publishedAt, now));

export const getVisibleSlugs = cache(async (kind: ArticleKind): Promise<string[]> => {
  'use cache';
  // Until publication/revalidation actions are connected, keep schedule visibility bounded.
  cacheLife('minutes');
  cacheTag(`kind:${kind}`, 'articles');

  const rows = await db
    .select({ slug: articles.slug })
    .from(articles)
    .where(and(eq(articles.kind, kind), visibleArticle(new Date())));

  return rows.map((row) => row.slug);
});

export async function getVisibleArticles(kind: ArticleKind, limit = 12) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`kind:${kind}`, 'articles');

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  return db
    .select({
      id: articles.id,
      kind: articles.kind,
      slug: articles.slug,
      title: articles.title,
      description: articles.description,
      publishedAt: articles.publishedAt,
      author: articles.author,
      tags: articles.tags,
      coverImageUrl: articles.coverImageUrl,
      coverAlt: articles.coverAlt,
      featured: articles.featured,
      score: articles.score,
      verdict: articles.verdict,
    })
    .from(articles)
    .where(and(eq(articles.kind, kind), visibleArticle(new Date())))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(safeLimit);
}

export async function getArticle(kind: ArticleKind, slug: string) {
  'use cache';
  cacheLife('minutes');
  const validSlugs = await getVisibleSlugs(kind);
  if (!validSlugs.includes(slug)) return null;

  cacheTag(`article:${kind}:${slug}`, `kind:${kind}`, 'articles');

  return db.query.articles.findFirst({
    where: and(eq(articles.kind, kind), eq(articles.slug, slug), visibleArticle(new Date())),
  });
}

/** Slugs plus their last update, used by the sitemap. */
export const getVisibleArticleEntries = cache(async (kind: ArticleKind) => {
  'use cache';
  cacheLife('minutes');
  cacheTag(`kind:${kind}`, 'articles');

  return db
    .select({ slug: articles.slug, updatedAt: articles.updatedAt })
    .from(articles)
    .where(and(eq(articles.kind, kind), visibleArticle(new Date())));
});

export type BodyMedia = {
  id: number;
  publicUrl: string;
  width: number;
  height: number;
  alt: string | null;
  variants: Array<{ width: number; publicUrl: string }>;
};

const loadBodyMedia = cache(async (ids: number[]): Promise<Record<number, BodyMedia>> => {
  'use cache';
  cacheLife('minutes');
  cacheTag('media');

  if (ids.length === 0) return {};

  const rows = await db
    .select({
      id: media.id,
      publicUrl: media.publicUrl,
      width: media.width,
      height: media.height,
      alt: media.alt,
    })
    .from(media)
    .where(and(inArray(media.id, ids), isNull(media.pendingDeleteAt)));

  const variants =
    rows.length > 0
      ? await db
          .select({
            mediaId: mediaVariants.mediaId,
            width: mediaVariants.width,
            publicUrl: mediaVariants.publicUrl,
          })
          .from(mediaVariants)
          .where(
            inArray(
              mediaVariants.mediaId,
              rows.map((row) => row.id)
            )
          )
          .orderBy(asc(mediaVariants.width))
      : [];

  const result: Record<number, BodyMedia> = {};
  for (const row of rows) {
    result[row.id] = {
      ...row,
      variants: variants
        .filter((variant) => variant.mediaId === row.id)
        .map(({ width, publicUrl }) => ({ width, publicUrl })),
    };
  }
  return result;
});

/** Resolves every `media:<id>` reference in an article body. */
export async function getBodyMedia(body: string): Promise<Record<number, BodyMedia>> {
  const ids = Array.from(
    new Set(Array.from(body.matchAll(/media:(\d+)(?!\d)/g), (match) => Number(match[1])))
  );
  return loadBodyMedia(ids);
}
