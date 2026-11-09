import { cache } from "react";
import { cacheTag } from "next/cache";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db/index.js";
import { articles } from "@/db/schema.js";

export const visibleArticle = (now: Date = new Date()) =>
  and(eq(articles.status, "published"), lte(articles.publishedAt, now));

export const getVisibleSlugs = cache(
  async (kind: string): Promise<string[]> => {
    "use cache";
    cacheTag(`kind:${kind}`, "articles");

    const rows = await db
      .select({ slug: articles.slug })
      .from(articles)
      .where(
        and(
          eq(articles.kind, kind),
          eq(articles.status, "published"),
          lte(articles.publishedAt, new Date()),
        ),
      );

    return rows.map((r) => r.slug);
  },
);

export async function getArticle(kind: string, slug: string) {
  "use cache";
  const validSlugs = await getVisibleSlugs(kind);
  if (!validSlugs.includes(slug)) return null;

  cacheTag(`article:${kind}:${slug}`, `kind:${kind}`, "articles");

  const now = new Date();
  return db.query.articles.findFirst({
    where: and(
      eq(articles.kind, kind),
      eq(articles.slug, slug),
      visibleArticle(now),
    ),
  });
}
