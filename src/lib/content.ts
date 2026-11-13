import { cache } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '@/db/index';
import { articles, games, media, mediaVariants, scoreRarities } from '@/db/schema';

export type ArticleKind = 'review' | 'news' | 'guide';

/** Rarity band of a score, as stored in the database. */
export type ScoreRarity = {
  key: string;
  label: string;
  colorToken: string;
};

export const visibleArticle = (now: Date = new Date()) =>
  and(eq(articles.status, 'published'), lte(articles.publishedAt, now));

export const getVisibleSlugs = cache(async (kind: ArticleKind): Promise<string[]> => {
  'use cache';
  // Editorial actions invalidate the tag immediately (read-your-own-writes).
  // The profile is the fallback for scheduled publications, which become
  // visible without any request: they wait for the revalidate window.
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
      category: articles.category,
      rarityKey: scoreRarities.key,
      rarityLabel: scoreRarities.label,
      rarityColorToken: scoreRarities.colorToken,
    })
    .from(articles)
    .leftJoin(scoreRarities, eq(articles.rarityKey, scoreRarities.key))
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
    with: { rarity: true },
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

/** Published games, used by the public catalog. */
export async function getVisibleGames(limit = 60) {
  'use cache';
  cacheLife('minutes');
  cacheTag('games');

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return db
    .select({
      id: games.id,
      slug: games.slug,
      title: games.title,
      description: games.description,
      coverImageUrl: games.coverImageUrl,
      coverAlt: games.coverAlt,
      platforms: games.platforms,
      genres: games.genres,
      releaseDate: games.releaseDate,
      developer: games.developer,
      publisher: games.publisher,
    })
    .from(games)
    .where(eq(games.status, 'published'))
    .orderBy(desc(games.createdAt), desc(games.id))
    .limit(safeLimit);
}

/**
 * Progress of the library: how many published games already have a review.
 *
 * The home page shows it as the "Nivel de biblioteca" progress bar.
 */
export async function getLibraryProgress() {
  'use cache';
  cacheLife('minutes');
  cacheTag('games', 'articles');

  const [gamesRow] = await db
    .select({ total: count() })
    .from(games)
    .where(eq(games.status, 'published'));
  const [reviewedRow] = await db
    .select({ total: countDistinct(articles.gameId) })
    .from(articles)
    .where(
      and(eq(articles.kind, 'review'), eq(articles.status, 'published'), isNotNull(articles.gameId))
    );

  const total = gamesRow?.total ?? 0;
  const reviewed = Math.min(reviewedRow?.total ?? 0, total);
  return {
    total,
    reviewed,
    progress: total > 0 ? Math.round((reviewed / total) * 100) : 0,
  };
}

/** Full text search over published articles (title, description and tags). */
export async function searchArticles(query: string, limit = 20) {
  const normalized = query.trim().slice(0, 80);
  if (!normalized) return [];

  const escaped = normalized.replace(/[\\%_]/g, (match) => `\\${match}`);
  const pattern = `%${escaped}%`;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);

  return db
    .select({
      id: articles.id,
      kind: articles.kind,
      slug: articles.slug,
      title: articles.title,
      description: articles.description,
      publishedAt: articles.publishedAt,
      tags: articles.tags,
      score: articles.score,
      rarityKey: scoreRarities.key,
      rarityLabel: scoreRarities.label,
      rarityColorToken: scoreRarities.colorToken,
    })
    .from(articles)
    .leftJoin(scoreRarities, eq(articles.rarityKey, scoreRarities.key))
    .where(
      and(
        visibleArticle(new Date()),
        or(
          sql`${articles.title} ilike ${pattern} escape '\\'`,
          sql`${articles.description} ilike ${pattern} escape '\\'`,
          sql`${articles.tags}::text ilike ${pattern} escape '\\'`
        )
      )
    )
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(safeLimit);
}

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
