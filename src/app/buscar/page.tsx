import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ScoreBadge } from '@/components/score-badge';
import { SearchForm } from '@/components/search-form';
import { SectionChips } from '@/components/section-chips';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import { searchArticles, type ArticleKind } from '@/lib/content';
import { articlePath } from '@/lib/routes';

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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 80);
  const results = query ? await searchArticles(query) : [];

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
            {results.length === 0
              ? `Sin resultados para “${query}”.`
              : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'} para “${query}”.`}
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
      </main>
      <SiteFooter />
    </div>
  );
}
