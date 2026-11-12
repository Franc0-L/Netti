import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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

export default async function CollectionPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: segment } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) notFound();

  const collection = COLLECTIONS[segment as keyof typeof COLLECTIONS];
  const articles = await getVisibleArticles(kind, 30);

  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath={articleCollectionPath(kind)} />
      <main id="contenido" tabIndex={-1}>
        <section className="collection-heading">
          <p className="eyebrow">ARCHIVO EDITORIAL</p>
          <h1>{collection.title}</h1>
          <p>{collection.description}</p>
        </section>
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
          <section aria-label={collection.title} className="article-grid">
            {articles.map((article) => (
              <article className="article-card" key={article.id}>
                <Link href={articlePath(kind, article.slug)} className="article-card-link">
                  <div className="article-card-meta">
                    <span>
                      {article.publishedAt?.toLocaleDateString('es-AR', { dateStyle: 'long' })}
                    </span>
                    {kind === 'review' && article.score !== null ? (
                      <span>{article.score}/10</span>
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
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
