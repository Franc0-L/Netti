import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ContentImage } from '@/components/content-image';
import { PlatformIcons } from '@/components/platform-icons';
import { SectionChips } from '@/components/section-chips';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import {
  getGameFilterOptions,
  getVisibleGameCount,
  getVisibleGames,
  type GameFilters,
} from '@/lib/content';
import { firstParamText } from '@/lib/search-params';

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

const PAGE_SIZE = 12;

type SearchParams = {
  plataforma?: string | string[];
  genero?: string | string[];
  anio?: string | string[];
  pagina?: string | string[];
};

export default async function GamesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const query = await searchParams;
  const platform = firstParamText(query.plataforma, 40);
  const genre = firstParamText(query.genero, 40);
  const rawYear = Number.parseInt(firstParamText(query.anio, 4), 10);
  const year =
    Number.isSafeInteger(rawYear) && rawYear > 1900 && rawYear < 2200 ? rawYear : undefined;
  const requestedPage = Number.parseInt(firstParamText(query.pagina, 8), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const filters: GameFilters = {
    ...(platform ? { platform } : {}),
    ...(genre ? { genre } : {}),
    ...(year ? { year } : {}),
  };

  const [options, total, games] = await Promise.all([
    getGameFilterOptions(),
    getVisibleGameCount(filters),
    getVisibleGames(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const filtered = Boolean(platform || genre || year);

  /** Builds a catalog URL with one filter replaced (`null` clears it). */
  const filterLink = (patch: {
    platform?: string | null;
    genre?: string | null;
    year?: number | null;
  }) => {
    const nextPlatform = patch.platform === null ? '' : (patch.platform ?? platform);
    const nextGenre = patch.genre === null ? '' : (patch.genre ?? genre);
    const nextYear =
      patch.year === null ? '' : patch.year ? String(patch.year) : year ? String(year) : '';
    const params = new URLSearchParams();
    if (nextPlatform) params.set('plataforma', nextPlatform);
    if (nextGenre) params.set('genero', nextGenre);
    if (nextYear) params.set('anio', nextYear);
    const queryString = params.toString();
    return queryString ? `/juegos?${queryString}` : '/juegos';
  };

  const pageLink = (target: number) => {
    const params = new URLSearchParams();
    if (platform) params.set('plataforma', platform);
    if (genre) params.set('genero', genre);
    if (year) params.set('anio', String(year));
    if (target > 1) params.set('pagina', String(target));
    const queryString = params.toString();
    return queryString ? `/juegos?${queryString}` : '/juegos';
  };

  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath="/juegos" />
      <main id="contenido" tabIndex={-1}>
        <section className="collection-heading">
          <p className="eyebrow">BIBLIOTECA</p>
          <h1>Juegos</h1>
          <p>Las fichas de los videojuegos que reseñamos, con sus plataformas y géneros.</p>
          <p>
            <Link className="text-link" href="/juegos/azar">
              Juego al azar <span aria-hidden="true">↗</span>
            </Link>
          </p>
        </section>
        <SectionChips currentPath="/juegos" />

        {options.platforms.length > 0 ? (
          <nav className="category-chips" aria-label="Filtrar por plataforma">
            <span className="filter-label">Plataforma</span>
            <Link
              className="category-chip"
              data-tone="cyan"
              href={filterLink({ platform: null })}
              aria-current={platform ? undefined : 'page'}
            >
              Todas
            </Link>
            {options.platforms.map((value) => (
              <Link
                className="category-chip"
                data-tone="cyan"
                href={filterLink({ platform: value })}
                key={value}
                aria-current={platform === value ? 'page' : undefined}
              >
                {value}
              </Link>
            ))}
          </nav>
        ) : null}

        {options.genres.length > 0 ? (
          <nav className="category-chips" aria-label="Filtrar por género">
            <span className="filter-label">Género</span>
            <Link
              className="category-chip"
              data-tone="cyan"
              href={filterLink({ genre: null })}
              aria-current={genre ? undefined : 'page'}
            >
              Todos
            </Link>
            {options.genres.map((value) => (
              <Link
                className="category-chip"
                data-tone="cyan"
                href={filterLink({ genre: value })}
                key={value}
                aria-current={genre === value ? 'page' : undefined}
              >
                {value}
              </Link>
            ))}
          </nav>
        ) : null}

        {options.years.length > 0 ? (
          <nav className="category-chips" aria-label="Filtrar por año">
            <span className="filter-label">Año</span>
            <Link
              className="category-chip"
              data-tone="cyan"
              href={filterLink({ year: null })}
              aria-current={year ? undefined : 'page'}
            >
              Todos
            </Link>
            {options.years.map((value) => (
              <Link
                className="category-chip"
                data-tone="cyan"
                href={filterLink({ year: value })}
                key={value}
                aria-current={year === value ? 'page' : undefined}
              >
                {value}
              </Link>
            ))}
          </nav>
        ) : null}

        {games.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              N.
            </span>
            {filtered ? (
              <>
                <h2>No hay juegos con esos filtros</h2>
                <p>Probá con otra plataforma, género o año.</p>
                <Link href="/juegos">Ver toda la biblioteca</Link>
              </>
            ) : (
              <>
                <h2>Todavía no hay fichas</h2>
                <p>La biblioteca se completa con la primera ficha publicada.</p>
                <Link href="/">Volver al inicio</Link>
              </>
            )}
          </div>
        ) : (
          <section aria-label="Juegos" className="article-grid">
            {games.map((game) => (
              <article className="article-card" key={game.id}>
                <Link
                  href={'/juegos/' + encodeURIComponent(game.slug)}
                  className="article-card-link"
                >
                  {game.coverImageUrl ? (
                    <ContentImage
                      className="article-card-cover"
                      src={game.coverImageUrl}
                      alt={game.coverAlt || game.title}
                      width={640}
                      height={360}
                      sizes="(max-width: 800px) 100vw, 33vw"
                    />
                  ) : null}
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
                    {game.genres.slice(0, 4).map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <PlatformIcons platforms={game.platforms} />
                  <span className="read-more">
                    Ver ficha <span aria-hidden="true">↗</span>
                  </span>
                </Link>
              </article>
            ))}
          </section>
        )}

        {totalPages > 1 ? (
          <nav className="pagination" aria-label="Páginas de la biblioteca">
            {page > 1 ? (
              <Link className="pagination-link" href={pageLink(page - 1)} rel="prev">
                <span aria-hidden="true">←</span> Anteriores
              </Link>
            ) : null}
            <span className="pagination-status">
              Página {page} de {totalPages}
            </span>
            {page < totalPages ? (
              <Link className="pagination-link" href={pageLink(page + 1)} rel="next">
                Siguientes <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
