import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { PlatformIcons } from '@/components/platform-icons';
import { SectionChips } from '@/components/section-chips';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import { getVisibleGames } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Juegos',
  description: 'Fichas de videojuegos: plataformas, géneros y estado de cada reseña.',
};

/**
 * Blocking route.
 *
 * The catalog comes from the database, so the response waits for the full
 * render instead of serving a stale prerendered shell.
 */
export const instant = false;

export default async function GamesPage() {
  await connection();
  const games = await getVisibleGames();

  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath="/juegos" />
      <main id="contenido" tabIndex={-1}>
        <section className="collection-heading">
          <p className="eyebrow">BIBLIOTECA</p>
          <h1>Juegos</h1>
          <p>Las fichas de los videojuegos que reseñamos, con sus plataformas y géneros.</p>
        </section>
        <SectionChips currentPath="/juegos" />
        {games.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              N.
            </span>
            <h2>Todavía no hay fichas</h2>
            <p>La biblioteca se completa con la primera ficha publicada.</p>
            <Link href="/">Volver al inicio</Link>
          </div>
        ) : (
          <section aria-label="Juegos" className="article-grid">
            {games.map((game) => (
              <article className="article-card" key={game.id}>
                <div className="article-card-link">
                  <div className="article-card-meta">
                    <span>{game.developer ?? 'Netti'}</span>
                    {game.releaseDate ? (
                      <time dateTime={game.releaseDate.toISOString()}>
                        {game.releaseDate.getUTCFullYear()}
                      </time>
                    ) : null}
                  </div>
                  <h2>{game.title}</h2>
                  {game.description ? <p>{game.description}</p> : null}
                  <div className="tag-list">
                    {game.genres.slice(0, 4).map((genre) => (
                      <span key={genre}>{genre}</span>
                    ))}
                  </div>
                  <PlatformIcons platforms={game.platforms} />
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
