import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentImage } from '@/components/content-image';
import { MarkdownContent } from '@/components/markdown-content';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import { getArticle, getBodyMedia } from '@/lib/content';
import { articleCollectionPath, articleKindFromSegment, articlePath } from '@/lib/routes';
import { safeJsonLd } from '@/lib/seo';

/**
 * Blocking route.
 *
 * The article depends on runtime params, so the response must wait for the full
 * render. That allows `notFound()` to answer with a 404 status instead of a
 * partially prerendered shell with status 200.
 */
export const instant = false;

type PageProps = {
  params: Promise<{ kind: string; slug: string }>;
};

const COLLECTION_TITLES = {
  review: 'Reseñas',
  news: 'Noticias',
  guide: 'Guías',
} as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: segment, slug } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) return { title: 'Artículo no encontrado | Netti' };

  const article = await getArticle(kind, slug);
  if (!article) return { title: 'Artículo no encontrado | Netti' };

  const siteUrl = process.env.PUBLIC_SITE_URL;
  const canonical = siteUrl ? new URL(articlePath(kind, slug), siteUrl).toString() : undefined;

  return {
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.description || undefined,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: 'article',
      title: article.seoTitle || article.title,
      description: article.seoDescription || article.description || undefined,
      publishedTime: article.publishedAt?.toISOString(),
      authors: article.author ? [article.author] : undefined,
      url: canonical,
      images: article.coverImageUrl
        ? [{ url: article.coverImageUrl, alt: article.coverAlt || article.title }]
        : undefined,
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { kind: segment, slug } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) notFound();

  const article = await getArticle(kind, slug);
  if (!article) notFound();

  const bodyMedia = await getBodyMedia(article.body);
  const collectionPath = articleCollectionPath(kind);
  const publishedDate = article.publishedAt?.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const siteUrl = process.env.PUBLIC_SITE_URL;
  const articleUrl = siteUrl ? new URL(articlePath(kind, slug), siteUrl).toString() : undefined;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.seoDescription || article.description || undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { '@type': 'Person', name: article.author || 'Netti' },
    image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    mainEntityOfPage: articleUrl,
  };

  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath={collectionPath} />
      <main id="contenido" tabIndex={-1}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
        <article className="article-page">
          <Link href={collectionPath} className="back-link">
            <span aria-hidden="true">←</span> {COLLECTION_TITLES[kind]}
          </Link>
          <header className="article-header">
            <p className="eyebrow">{COLLECTION_TITLES[kind]}</p>
            <h1>{article.title}</h1>
            {article.description ? <p className="article-deck">{article.description}</p> : null}
            <div className="article-byline">
              {article.author ? <span>{article.author}</span> : <span>Netti</span>}
              {publishedDate ? (
                <span>
                  <time dateTime={article.publishedAt?.toISOString()}>{publishedDate}</time>
                </span>
              ) : null}
              {kind === 'review' && article.score !== null ? (
                <strong>{article.score}/10</strong>
              ) : null}
            </div>
          </header>
          {article.coverImageUrl ? (
            <figure className="article-cover">
              <ContentImage
                src={article.coverImageUrl}
                alt={article.coverAlt || article.title}
                width={1600}
                height={900}
                sizes="100vw"
              />
            </figure>
          ) : null}
          <MarkdownContent source={article.body} media={bodyMedia} />
          {kind === 'review' && article.verdict ? (
            <aside className="verdict">
              <p className="eyebrow">VEREDICTO</p>
              <p>{article.verdict}</p>
            </aside>
          ) : null}
          {article.tags.length > 0 ? (
            <div className="tag-list article-tags">
              {article.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
