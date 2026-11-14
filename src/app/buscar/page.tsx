import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ScoreBadge } from '@/components/score-badge';
import { SearchForm } from '@/components/search-form';
import { SectionChips } from '@/components/section-chips';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import { searchArticles, type ArticleKind } from '@/lib/content';
import { articlePath } from '@/lib/routes';
import { firstParamText } from '@/lib/search-params';

export const metadata: Metadata = {
  title: 'Buscar',
  description: 'Buscá reseñas, noticias y guías de Netti.',
};

/**
 * Blocking route.
 *
 * The results depend on the query string, so the page must wait for the full
 * render instead of being prerendered as an empty shell.
 */
export const instant = false;

const KIND_LABELS: Record<ArticleKind, string> = {
  review: 'Reseña',
  news: 'Noticia',
  guide: 'Guía',
};

const PAGE_SIZE = 20;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; pagina?: string | string[] }>;
}) {
  await connection();
  const params = await searchParams;
  // A repeated parameter arrives as an array: reading it directly would throw.
  const query = firstParamText(params.q, 80);
  const requestedPage = Number.parseInt(firstParamText(params.pagina, 8), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const { results, total } = query
    ? await searchArticles(query, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    : { results: [], total: 0 };
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const pageLink = (target: number) => {
    const next = new URLSearchParams();
    next.set('q', query);
    if (target > 1) next.set('pagina', String(target));
    return `/buscar?${next.toString()}`;
  };

  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath="/buscar" />
      <main id="contenido" tabIndex={-1}>
        <section className="collection-heading">
          <p className="eyebrow">BUSCADOR</p>
          <h1>Buscar</h1>
          <p>Encontrá reseñas, noticias y guías por título, descripción o etiqueta.</p>
        </section>
        <div className="search-panel">
          <SearchForm defaultValue={query} id="search-page" />
        </div>
        <SectionChips />
        {query ? (
          <p className="search-summary" role="status">
            {total === 0
              ? `Sin resultados para “${query}”.`
              : `${total} ${total === 1 ? 'resultado' : 'resultados'} para “${query}”.`}
          </p>
        ) : null}
        {results.length > 0 ? (
          <section aria-label="Resultados de búsqueda" className="article-grid">
            {results.map((result) => (
              <article className="article-card" key={result.id}>
                <Link
                  href={articlePath(result.kind as ArticleKind, result.slug)}
                  className="article-card-link"
                >
                  <div className="article-card-meta">
                    <span>{KIND_LABELS[result.kind as ArticleKind] ?? result.kind}</span>
                    {result.kind === 'review' && result.score !== null ? (
                      <ScoreBadge
                        score={result.score}
                        rarity={
                          result.rarityKey && result.rarityLabel && result.rarityColorToken
                            ? {
                                key: result.rarityKey,
                                label: result.rarityLabel,
                                colorToken: result.rarityColorToken,
                              }
                            : null
                        }
                        compact
                      />
                    ) : null}
                  </div>
                  <h2>{result.title}</h2>
                  {result.description ? <p>{result.description}</p> : null}
                  {result.tags.length > 0 ? (
                    <div className="tag-list">
                      {result.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              </article>
            ))}
          </section>
        ) : null}
        {query && totalPages > 1 ? (
          <nav className="pagination" aria-label="Páginas de resultados">
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
