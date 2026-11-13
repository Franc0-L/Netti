import { eq, desc, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { articles, games, media } from '@/db/schema';
import { AdminArticleForm } from '@/components/admin-article-form';

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article || article.status === 'trashed') notFound();
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
    kind: article.kind as 'review' | 'news' | 'guide',
    slug: article.slug,
    title: article.title,
    description: article.description,
    body: article.body,
    author: article.author ?? '',
    tags: article.tags.join(', '),
    status: article.status as 'draft' | 'published',
    publishedAt: article.publishedAt?.toISOString() ?? null,
    featured: article.featured,
    coverMediaId: article.coverMediaId,
    coverAlt: article.coverAlt ?? '',
    ogMediaId: article.ogMediaId,
    gameId: article.gameId,
    score: article.score?.toString() ?? '',
    scoreStory: article.scoreDetails?.story?.toString() ?? '',
    scoreGameplay: article.scoreDetails?.gameplay?.toString() ?? '',
    scoreVisual: article.scoreDetails?.visual?.toString() ?? '',
    scoreReason: article.scoreReason ?? '',
    verdict: article.verdict ?? '',
    category: article.category ?? '',
    sourceName: article.sourceName ?? '',
    sourceUrl: article.sourceUrl ?? '',
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
  };
  return (
    <AdminArticleForm
      articleId={article.id}
      version={article.version}
      initial={initial}
      media={mediaItems}
      games={gameItems}
    />
  );
}
