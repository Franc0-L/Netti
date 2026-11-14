import { cache } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from 'drizzle-orm';
import { db } from '@/db/index';
import { articleGallery, articles, games, media, mediaVariants, scoreRarities } from '@/db/schema';
import { searchDocuments } from '@/lib/search';

export type ArticleKind = 'review' | 'news' | 'guide';

/** Rarity band of a score, as stored in the database. */
export type ScoreRarity = {
  key: string;
  label: string;
  colorToken: string;
};

export const visibleArticle = (now: Date = new Date()) =>
  and(eq(articles.status, 'published'), lte(articles.publishedAt, now));

export async function getVisibleArticles(
  kind: ArticleKind,
  limit = 12,
  category?: string,
  offset = 0
) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`kind:${kind}`, 'articles');

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const safeOffset = Math.max(Math.trunc(offset), 0);
  const categoryFilter = category ? eq(articles.category, category) : undefined;

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
    .where(and(eq(articles.kind, kind), visibleArticle(new Date()), categoryFilter))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(safeLimit)
    .offset(safeOffset);
}

/**
 * Featured publications.
 *
 * The home page highlights the articles marked as featured from the panel, so
 * the editorial decision has a visible effect.
 */
export async function getFeaturedArticles(limit = 3) {
  'use cache';
  cacheLife('minutes');
  cacheTag('home', 'articles');

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 12);
  return db
    .select({
      id: articles.id,
      kind: articles.kind,
      slug: articles.slug,
      title: articles.title,
      description: articles.description,
      publishedAt: articles.publishedAt,
      tags: articles.tags,
      coverImageUrl: articles.coverImageUrl,
      coverAlt: articles.coverAlt,
      featured: articles.featured,
      score: articles.score,
      rarityKey: scoreRarities.key,
      rarityLabel: scoreRarities.label,
      rarityColorToken: scoreRarities.colorToken,
    })
    .from(articles)
    .leftJoin(scoreRarities, eq(articles.rarityKey, scoreRarities.key))
    .where(and(eq(articles.featured, true), visibleArticle(new Date())))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(safeLimit);
}

/**
 * Total number of visible articles of a collection.
 *
 * Used by the collection pages to paginate: the count must cover the whole
 * collection, not only the current page.
 */
export async function getVisibleArticleCount(kind: ArticleKind, category?: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`kind:${kind}`, 'articles');

  const categoryFilter = category ? eq(articles.category, category) : undefined;
  const [row] = await db
    .select({ total: count() })
    .from(articles)
    .where(and(eq(articles.kind, kind), visibleArticle(new Date()), categoryFilter));

  return row?.total ?? 0;
}

/**
 * Distinct categories of a collection.
 *
 * The chips are built from every visible article, not from the first page, so
 * a category that only appears in an old article stays reachable.
 */
export async function getVisibleCategories(kind: ArticleKind): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag(`kind:${kind}`, 'articles');

  const rows = await db
    .selectDistinct({ category: articles.category })
    .from(articles)
    .where(
      and(
        eq(articles.kind, kind),
        visibleArticle(new Date()),
        isNotNull(articles.category),
        sql`${articles.category} <> ''`
      )
    )
    .orderBy(sql`${articles.category} asc`);

  return rows.map((row) => row.category ?? '').filter(Boolean);
}

export async function getArticle(kind: ArticleKind, slug: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`article:${kind}:${slug}`, `kind:${kind}`, 'articles');

  // The unique index on (kind, slug) resolves the article directly: the
  // collection slug list is not needed to know whether the article exists.
  return db.query.articles.findFirst({
    where: and(eq(articles.kind, kind), eq(articles.slug, slug), visibleArticle(new Date())),
    with: { rarity: true },
  });
}

/**
 * Structured gallery of an article, ready to render.
 *
 * The images are resolved in a second query so the article itself stays a
 * single row; the gallery is ordered by the position chosen in the panel.
 */
export async function getArticleGallery(articleId: number) {
  'use cache';
  cacheLife('minutes');
  cacheTag('media', 'articles');

  return db
    .select({
      id: media.id,
      publicUrl: media.publicUrl,
      alt: media.alt,
      width: media.width,
      height: media.height,
    })
    .from(articleGallery)
    .innerJoin(media, eq(articleGallery.mediaId, media.id))
    .where(and(eq(articleGallery.articleId, articleId), isNull(media.pendingDeleteAt)))
    .orderBy(asc(articleGallery.position));
}

/**
 * Related publications: same collection and at least one shared tag.
 *
 * When there is no tag overlap the list is empty on purpose: a "related"
 * section padded with arbitrary articles is noise, not context.
 */
export async function getRelatedArticles(
  kind: ArticleKind,
  articleId: number,
  tags: string[],
  limit = 3
) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`kind:${kind}`, 'articles');

  if (tags.length === 0) return [];
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 6);

  return db
    .select({
      id: articles.id,
      kind: articles.kind,
      slug: articles.slug,
      title: articles.title,
      description: articles.description,
      publishedAt: articles.publishedAt,
      coverImageUrl: articles.coverImageUrl,
      coverAlt: articles.coverAlt,
      score: articles.score,
      rarityKey: scoreRarities.key,
      rarityLabel: scoreRarities.label,
      rarityColorToken: scoreRarities.colorToken,
    })
    .from(articles)
    .leftJoin(scoreRarities, eq(articles.rarityKey, scoreRarities.key))
    .where(
      and(
        eq(articles.kind, kind),
        ne(articles.id, articleId),
        arrayOverlaps(articles.tags, tags),
        visibleArticle(new Date())
      )
    )
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(safeLimit);
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

/** Filters of the public game catalog. */
export type GameFilters = {
  platform?: string;
  genre?: string;
  year?: number;
};

/** Conditions shared by the catalog list and its counter. */
function gameConditions(filters: GameFilters) {
  return and(
    eq(games.status, 'published'),
    filters.platform ? arrayContains(games.platforms, [filters.platform]) : undefined,
    filters.genre ? arrayContains(games.genres, [filters.genre]) : undefined,
    filters.year
      ? and(
          gte(games.releaseDate, new Date(Date.UTC(filters.year, 0, 1))),
          lt(games.releaseDate, new Date(Date.UTC(filters.year + 1, 0, 1)))
        )
      : undefined
  );
}

/** Published games, used by the public catalog. */
export async function getVisibleGames(filters: GameFilters = {}, limit = 24, offset = 0) {
  'use cache';
  cacheLife('minutes');
  cacheTag('games');

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 60);
  const safeOffset = Math.max(Math.trunc(offset), 0);
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
      featured: games.featured,
    })
    .from(games)
    .where(gameConditions(filters))
    .orderBy(desc(games.createdAt), desc(games.id))
    .limit(safeLimit)
    .offset(safeOffset);
}

/** Total number of published games matching the filters. */
export async function getVisibleGameCount(filters: GameFilters = {}) {
  'use cache';
  cacheLife('minutes');
  cacheTag('games');

  const [row] = await db.select({ total: count() }).from(games).where(gameConditions(filters));
  return row?.total ?? 0;
}

/**
 * Platforms, genres and years available in the catalog.
 *
 * The chips are built from the published games, so a filter never offers a
 * value that returns nothing. The arrays are flattened and sorted in memory:
 * the catalog is small and this keeps the query portable.
 */
export async function getGameFilterOptions() {
  'use cache';
  cacheLife('minutes');
  cacheTag('games');

  const [platformRows, genreRows, yearRows] = await Promise.all([
    db
      .selectDistinct({ value: sql<string>`unnest(${games.platforms})` })
      .from(games)
      .where(eq(games.status, 'published')),
    db
      .selectDistinct({ value: sql<string>`unnest(${games.genres})` })
      .from(games)
      .where(eq(games.status, 'published')),
    db
      .selectDistinct({ value: sql<number>`extract(year from ${games.releaseDate})::int` })
      .from(games)
      .where(and(eq(games.status, 'published'), isNotNull(games.releaseDate))),
  ]);

  const uniqueSorted = (values: string[]) =>
    Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));

  return {
    platforms: uniqueSorted(platformRows.map((row) => row.value)),
    genres: uniqueSorted(genreRows.map((row) => row.value)),
    years: yearRows
      .map((row) => Number(row.value))
      .filter((year) => Number.isSafeInteger(year))
      .sort((a, b) => b - a),
  };
}

/** Published game sheet, if it exists. */
export async function getGame(slug: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`game:${slug}`, 'games', 'articles');

  return db.query.games.findFirst({
    where: and(eq(games.slug, slug), eq(games.status, 'published')),
  });
}

/** Minimal game data used to link a review to its sheet. */
export async function getGameSummary(gameId: number) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`game:${gameId}`, 'games');

  const [row] = await db
    .select({ id: games.id, slug: games.slug, title: games.title })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.status, 'published')))
    .limit(1);
  return row ?? null;
}

/** Published reviews of a game, newest first. */ export async function getGameReviews(
  gameId: number,
  limit = 12
) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`game:${gameId}`, 'games', 'articles');

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 24);
  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      description: articles.description,
      publishedAt: articles.publishedAt,
      score: articles.score,
      rarityKey: scoreRarities.key,
      rarityLabel: scoreRarities.label,
      rarityColorToken: scoreRarities.colorToken,
    })
    .from(articles)
    .leftJoin(scoreRarities, eq(articles.rarityKey, scoreRarities.key))
    .where(
      and(eq(articles.kind, 'review'), eq(articles.gameId, gameId), visibleArticle(new Date()))
    )
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(safeLimit);
}

/**
 * One random published game.
 *
 * Not cached: the whole point is to get a different sheet on every visit.
 */
export async function getRandomGame(): Promise<{ slug: string } | null> {
  const [row] = await db
    .select({ slug: games.slug })
    .from(games)
    .where(eq(games.status, 'published'))
    .orderBy(sql`random()`)
    .limit(1);
  return row ?? null;
}

/**
 * Progress of the library: how many published games already have a review.
 *
 * The home page shows it as the "Nivel de biblioteca" progress bar.
 *
 * A review only counts when it is actually visible: a scheduled review, or a
 * review attached to a game that is still a draft, must not inflate the
 * public progress bar.
 */
export async function getLibraryProgress() {
  'use cache';
  cacheLife('minutes');
  cacheTag('games', 'articles');

  const now = new Date();
  const [gamesRow] = await db
    .select({ total: count() })
    .from(games)
    .where(eq(games.status, 'published'));
  const [reviewedRow] = await db
    .select({ total: countDistinct(articles.gameId) })
    .from(articles)
    .innerJoin(games, eq(articles.gameId, games.id))
    .where(
      and(
        eq(articles.kind, 'review'),
        visibleArticle(now),
        isNotNull(articles.gameId),
        eq(games.status, 'published')
      )
    );

  const total = gamesRow?.total ?? 0;
  const reviewed = Math.min(reviewedRow?.total ?? 0, total);
  return {
    total,
    reviewed,
    progress: total > 0 ? Math.round((reviewed / total) * 100) : 0,
  };
}

/** A document of the public static search index. */
export type SearchIndexEntry = {
  id: number;
  kind: ArticleKind;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  score: number | null;
  rarityKey: string | null;
  rarityLabel: string | null;
  rarityColorToken: string | null;
};

/**
 * Static search index.
 *
 * The public search must not query Postgres on every request: the index is
 * loaded once, cached and invalidated when the editorial actions publish
 * something. The matching happens in memory over this list.
 */
const loadSearchIndex = cache(async (): Promise<SearchIndexEntry[]> => {
  'use cache';
  cacheLife('hours');
  cacheTag('articles');

  const rows = await db
    .select({
      id: articles.id,
      kind: articles.kind,
      slug: articles.slug,
      title: articles.title,
      description: articles.description,
      tags: articles.tags,
      score: articles.score,
      rarityKey: scoreRarities.key,
      rarityLabel: scoreRarities.label,
      rarityColorToken: scoreRarities.colorToken,
    })
    .from(articles)
    .leftJoin(scoreRarities, eq(articles.rarityKey, scoreRarities.key))
    .where(visibleArticle(new Date()))
    .orderBy(desc(articles.publishedAt), desc(articles.id));

  return rows.map((row) => ({
    ...row,
    kind: row.kind as ArticleKind,
    rarityKey: row.rarityKey ?? null,
    rarityLabel: row.rarityLabel ?? null,
    rarityColorToken: row.rarityColorToken ?? null,
  }));
});

/**
 * Search over published articles (title, description and tags).
 *
 * The query runs against the cached static index, so it never touches
 * Postgres at request time.
 */
export async function searchArticles(
  query: string,
  limit = 20,
  offset = 0
): Promise<{ results: SearchIndexEntry[]; total: number }> {
  const index = await loadSearchIndex();
  const { results, total } = searchDocuments(index, query, limit, offset);
  return { results, total };
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
