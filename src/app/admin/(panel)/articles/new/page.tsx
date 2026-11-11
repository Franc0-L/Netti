import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { games, media } from '@/db/schema';
import { AdminArticleForm } from '@/components/admin-article-form';

export default async function NewArticlePage() {
  const [mediaItems, gameItems] = await Promise.all([
    db
      .select({
        id: media.id,
        publicUrl: media.publicUrl,
        width: media.width,
        height: media.height,
        alt: media.alt,
      })
      .from(media)
      .where(isNull(media.pendingDeleteAt))
      .orderBy(desc(media.createdAt))
      .limit(60),
    db
      .select({ id: games.id, title: games.title })
      .from(games)
      .where(eq(games.status, 'published'))
      .orderBy(games.title)
      .limit(500),
  ]);
  const initial = {
    kind: 'news' as const,
    slug: '',
    title: '',
    description: '',
    body: '',
    author: '',
    tags: '',
    status: 'draft' as const,
    publishedAt: null,
    featured: false,
    coverMediaId: null,
    coverAlt: '',
    ogMediaId: null,
    gameId: null,
    score: '',
    scoreReason: '',
    verdict: '',
    category: '',
    sourceName: '',
    sourceUrl: '',
    seoTitle: '',
    seoDescription: '',
  };
  return <AdminArticleForm initial={initial} media={mediaItems} games={gameItems} />;
}
