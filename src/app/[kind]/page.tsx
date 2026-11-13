import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScoreBadge } from '@/components/score-badge';
import { SectionChips } from '@/components/section-chips';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import { getVisibleArticles } from '@/lib/content';
import { articleCollectionPath, articleKindFromSegment, articlePath } from '@/lib/routes';

/**
 * Blocking route.
 *
 * The collection depends on runtime params, so the response must wait for the
 * full render. That allows `notFound()` to answer with a 404 status instead of
 * a partially prerendered shell with status 200.
 */
export const instant = false;

const COLLECTIONS = {
  resenas: { title: 'Reseñas', description: 'Análisis y opiniones sobre videojuegos.' },
  noticias: { title: 'Noticias', description: 'Novedades del mundo de los videojuegos.' },
  guias: { title: 'Guías', description: 'Guías, consejos y soluciones.' },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}): Promise<Metadata> {
  const { kind: segment } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) return { title: 'Página no encontrada | Netti' };

  const collection = COLLECTIONS[segment as keyof typeof COLLECTIONS];
  const siteUrl = process.env.PUBLIC_SITE_URL;
  const canonical = siteUrl ? new URL(articleCollectionPath(kind), siteUrl).toString() : undefined;

  return {
    title: collection.title,
    description: collection.description,
    alternates: canonical ? { canonical } : undefined,
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { kind: segment } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) notFound();

  const collection = COLLECTIONS[segment as keyof typeof COLLECTIONS];
  const collectionPath = articleCollectionPath(kind);
  const [query] = await Promise.all([searchParams]);
  const allArticles = await getVisibleArticles(kind, 30);
  const categories = [
    ...new Set(
      allArticles.map((article) => article.category).filter((value): value is string => !!value)
    ),
  ];
  const activeCategory = query.categoria?.trim() ?? '';
  const articles = activeCategory
    ? allArticles.filter((article) => article.category === activeCategory)
    : allArticles;
  const [lead, ...rest] = articles;
  const topStories = articles.slice(0, 4);

  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath={collectionPath} />
      <main id="contenido" tabIndex={-1}>
        <section className="collection-heading">
          <p className="eyebrow">ARCHIVO EDITORIAL</p>
          <h1>{collection.title}</h1>
          <p>{collection.description}</p>
        </section>
        <SectionChips currentPath={collectionPath} />
        {categories.length > 0 ? (
          <nav className="category-chips" aria-label="Filtrar por categoría">
            <Link
              className="category-chip"
              data-tone={segment === 'resenas' ? 'gold' : segment === 'noticias' ? 'red' : 'green'}
              href={collectionPath}
              aria-current={activeCategory ? undefined : 'page'}
            >
              Todas
            </Link>
            {categories.map((category) => (
              <Link
                className="category-chip"
                data-tone={
                  segment === 'resenas' ? 'gold' : segment === 'noticias' ? 'red' : 'green'
                }
                href={`${collectionPath}?categoria=${encodeURIComponent(category)}`}
                key={category}
                aria-current={activeCategory === category ? 'page' : undefined}
              >
                {category}
              </Link>
            ))}
          </nav>
        ) : null}
        {articles.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              N.
            </span>
            <h2>Todavía no hay publicaciones</h2>
            <p>Esta colección aparecerá aquí cuando haya contenido publicado.</p>
            <Link href="/">Volver al inicio</Link>
          </div>
        ) : (
          <div className="collection-layout">
            <section aria-label={collection.title} className="article-grid">
              {lead ? (
                <article className="article-card article-card-lead">
                  <Link href={articlePath(kind, lead.slug)} className="article-card-link">
                    <div className="article-card-meta">
                      <span>
                        {lead.publishedAt?.toLocaleDateString('es-AR', { dateStyle: 'long' })}
                      </span>
                      {kind === 'review' && lead.score !== null ? (
                        <ScoreBadge
                          score={lead.score}
                          rarity={
                            lead.rarityKey && lead.rarityLabel && lead.rarityColorToken
                              ? {
                                  key: lead.rarityKey,
                                  label: lead.rarityLabel,
                                  colorToken: lead.rarityColorToken,
                                }
                              : null
                          }
                        />
                      ) : null}
                    </div>
                    <h2>{lead.title}</h2>
                    {lead.description ? <p>{lead.description}</p> : null}
                    {lead.tags.length > 0 ? (
                      <div className="tag-list">
                        {lead.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    <span className="read-more">
                      Leer artículo <span aria-hidden="true">↗</span>
                    </span>
                  </Link>
                </article>
              ) : null}
              {rest.map((article) => (
                <article className="article-card" key={article.id}>
                  <Link href={articlePath(kind, article.slug)} className="article-card-link">
                    <div className="article-card-meta">
                      <span>
                        {article.publishedAt?.toLocaleDateString('es-AR', { dateStyle: 'long' })}
                      </span>
                      {kind === 'review' && article.score !== null ? (
                        <ScoreBadge
                          score={article.score}
                          rarity={
                            article.rarityKey && article.rarityLabel && article.rarityColorToken
                              ? {
                                  key: article.rarityKey,
                                  label: article.rarityLabel,
                                  colorToken: article.rarityColorToken,
                                }
                              : null
                          }
                          compact
                        />
                      ) : null}
                    </div>
                    <h2>{article.title}</h2>
                    {article.description ? <p>{article.description}</p> : null}
                    {article.tags.length > 0 ? (
                      <div className="tag-list">
                        {article.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    <span className="read-more">
                      Leer artículo <span aria-hidden="true">↗</span>
                    </span>
                  </Link>
                </article>
              ))}
            </section>
            <aside className="collection-sidebar" aria-labelledby="top-stories-heading">
              <h2 id="top-stories-heading">Historias principales</h2>
              <ol>
                {topStories.map((article, index) => (
                  <li key={article.id}>
                    <Link href={articlePath(kind, article.slug)}>
                      <span className="top-story-rank" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="top-story-text">
                        <span className="top-story-title">{article.title}</span>
                        {article.publishedAt ? (
                          <time dateTime={article.publishedAt.toISOString()}>
                            {article.publishedAt.toLocaleDateString('es-AR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </time>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
