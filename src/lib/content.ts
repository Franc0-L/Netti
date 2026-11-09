import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db/index";
import { articles } from "@/db/schema";

export type ArticleKind = "review" | "news" | "guide";

export const visibleArticle = (now: Date = new Date()) =>
  and(
    eq(articles.status, "published"),
    lte(articles.publishedAt, now),
  );

export const getVisibleSlugs = cache(
  async (kind: ArticleKind): Promise<string[]> => {
    "use cache";
    // Until publication/revalidation actions are connected, keep schedule visibility bounded.
    cacheLife("minutes");
    cacheTag(`kind:${kind}`, "articles");

    const rows = await db
      .select({ slug: articles.slug })
      .from(articles)
      .where(and(eq(articles.kind, kind), visibleArticle(new Date())));

    return rows.map((row) => row.slug);
  },
);

export async function getVisibleArticles(kind: ArticleKind, limit = 12) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`kind:${kind}`, "articles");

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
  "use cache";
  cacheLife("minutes");
  const validSlugs = await getVisibleSlugs(kind);
  if (!validSlugs.includes(slug)) return null;

  cacheTag(`article:${kind}:${slug}`, `kind:${kind}`, "articles");

  return db.query.articles.findFirst({
    where: and(
      eq(articles.kind, kind),
      eq(articles.slug, slug),
      visibleArticle(new Date()),
    ),
  });
}
