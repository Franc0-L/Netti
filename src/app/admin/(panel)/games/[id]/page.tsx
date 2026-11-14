import Link from 'next/link';
import { desc, eq, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { games, media } from '@/db/schema';
import { AdminGameActions } from '@/components/admin-game-actions';
import { AdminGameForm } from '@/components/admin-game-form';

export default async function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) notFound();

  const [game] = await db.select().from(games).where(eq(games.id, id)).limit(1);
  if (!game) notFound();

  if (game.status === 'trashed') {
    return (
      <>
        <div className="admin-toolbar">
          <div>
            <p className="admin-eyebrow">FICHA / {game.id}</p>
            <h1>{game.title}</h1>
            <p className="admin-muted">
              Esta ficha está en la papelera. Restaurala para volver a editarla.
            </p>
          </div>
          <Link className="admin-button admin-button-quiet" href="/admin/games">
            Volver a juegos
          </Link>
        </div>
        <section className="admin-panel">
          <AdminGameActions id={game.id} status="trashed" />
        </section>
      </>
    );
  }

  const mediaItems = await db
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
    .limit(60);

  // The cover may be older than the newest 60 images: keep it in the list so
  // the select shows the current value.
  const known = new Set(mediaItems.map((item) => item.id));
  if (game.coverMediaId && !known.has(game.coverMediaId)) {
    const [cover] = await db
      .select({
        id: media.id,
        publicUrl: media.publicUrl,
        width: media.width,
        height: media.height,
        alt: media.alt,
      })
      .from(media)
      .where(eq(media.id, game.coverMediaId))
      .limit(1);
    if (cover) mediaItems.push(cover);
  }

  return (
    <AdminGameForm
      gameId={game.id}
      status={game.status as 'draft' | 'published'}
      initial={{
        slug: game.slug,
        title: game.title,
        description: game.description,
        body: game.body,
        developer: game.developer ?? '',
        publisher: game.publisher ?? '',
        releaseDate: game.releaseDate?.toISOString().slice(0, 10) ?? '',
        platforms: game.platforms.join(', '),
        genres: game.genres.join(', '),
        tags: game.tags.join(', '),
        featured: game.featured,
        coverMediaId: game.coverMediaId,
        coverAlt: game.coverAlt ?? '',
      }}
      media={mediaItems}
    />
  );
}
