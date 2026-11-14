import { eq, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { articleGallery, articles, games } from '@/db/schema';

/**
 * Reference detection for media assets.
 *
 * An image is "in use" when an article uses it as its cover or social image,
 * when it appears in the structured gallery of an article, or when some body
 * (article or game) embeds it with a `media:<id>` reference.
 *
 * The pattern is bounded on purpose: `media:1` must not match `media:12`.
 */
const BODY_REFERENCE = (mediaId: number) => `media:${mediaId}([^0-9]|$)`;

/**
 * Reports whether any article, gallery or game still references the image.
 *
 * The storage sweep uses it before deleting an object, and the panel uses it
 * before marking an image for deletion.
 */
export async function isMediaReferenced(mediaId: number): Promise<boolean> {
  const bodyPattern = BODY_REFERENCE(mediaId);

  const [articleRef] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      or(
        eq(articles.coverMediaId, mediaId),
        eq(articles.ogMediaId, mediaId),
        sql`${articles.body} ~ ${bodyPattern}`
      )
    )
    .limit(1);
  if (articleRef) return true;

  const [galleryRef] = await db
    .select({ id: articleGallery.id })
    .from(articleGallery)
    .where(eq(articleGallery.mediaId, mediaId))
    .limit(1);
  if (galleryRef) return true;

  const [gameRef] = await db
    .select({ id: games.id })
    .from(games)
    .where(or(eq(games.coverMediaId, mediaId), sql`${games.body} ~ ${bodyPattern}`))
    .limit(1);
  return Boolean(gameRef);
}
