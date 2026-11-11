import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getVisibleSlugs, type ArticleKind } from '@/lib/content';
import { articlePath } from '@/lib/routes';

const COLLECTIONS: ArticleKind[] = ['review', 'news', 'guide'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  const siteUrl = process.env.PUBLIC_SITE_URL;
  if (!siteUrl) return [];

  const baseUrl = new URL(siteUrl);
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl.toString() },
    { url: new URL('/resenas', baseUrl).toString() },
    { url: new URL('/noticias', baseUrl).toString() },
    { url: new URL('/guias', baseUrl).toString() },
  ];

  const collections = await Promise.all(
    COLLECTIONS.map(async (kind) => ({
      kind,
      slugs: await getVisibleSlugs(kind),
    }))
  );

  for (const collection of collections) {
    for (const slug of collection.slugs) {
      entries.push({
        url: new URL(articlePath(collection.kind, slug), baseUrl).toString(),
      });
    }
  }

  return entries;
}
