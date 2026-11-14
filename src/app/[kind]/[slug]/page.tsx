import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentImage } from '@/components/content-image';
import { MarkdownContent } from '@/components/markdown-content';
import { ScoreBadge } from '@/components/score-badge';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import {
  getArticle,
  getArticleGallery,
  getBodyMedia,
  getGameSummary,
  getRelatedArticles,
  type ArticleKind,
} from '@/lib/content';
import { articleCollectionPath, articleKindFromSegment, articlePath } from '@/lib/routes';
import { safeJsonLd } from '@/lib/seo';
import { videoEmbedUrl } from '@/lib/video';

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
  // The social image can be chosen independently from the cover.
  const socialImage = article.ogImageUrl ?? article.coverImageUrl;

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
      images: socialImage
        ? [{ url: socialImage, alt: article.coverAlt || article.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.seoTitle || article.title,
      description: article.seoDescription || article.description || undefined,
      images: socialImage
        ? [{ url: socialImage, alt: article.coverAlt || article.title }]
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

  const [bodyMedia, gallery, related, game] = await Promise.all([
    getBodyMedia(article.body),
    getArticleGallery(article.id),
    getRelatedArticles(kind as ArticleKind, article.id, article.tags),
    article.kind === 'review' && article.gameId ? getGameSummary(article.gameId) : null,
  ]);

  const collectionPath = articleCollectionPath(kind);
  const publishedDate = article.publishedAt?.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const siteUrl = process.env.PUBLIC_SITE_URL;
  const articleUrl = siteUrl ? new URL(articlePath(kind, slug), siteUrl).toString() : undefined;
  const embedUrl = videoEmbedUrl(article.videoUrl);
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
    video: article.videoUrl
      ? {
          '@type': 'VideoObject',
          name: article.videoTitle || article.title,
          contentUrl: article.videoUrl,
          embedUrl: embedUrl ?? undefined,
        }
      : undefined,
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
              {game ? (
                <span>
                  <Link href={`/juegos/${game.slug}`}>{game.title}</Link>
                </span>
              ) : null}
            </div>
          </header>
          {kind === 'review' && article.score !== null ? (
            <ScoreBreakdown
              score={article.score}
              rarity={article.rarity}
              details={article.scoreDetails ?? null}
            />
          ) : null}
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

          {article.pros.length > 0 || article.cons.length > 0 ? (
            <div className="pros-cons">
              {article.pros.length > 0 ? (
                <section aria-labelledby="pros-heading">
                  <h2 id="pros-heading">A favor</h2>
                  <ul className="pros">
                    {article.pros.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {article.cons.length > 0 ? (
                <section aria-labelledby="cons-heading">
                  <h2 id="cons-heading">En contra</h2>
                  <ul className="cons">
                    {article.cons.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          {article.videoUrl && article.videoTitle ? (
            <section className="article-video" aria-labelledby="video-heading">
              <h2 id="video-heading">{article.videoTitle}</h2>
              {embedUrl ? (
                <div className="video-frame">
                  <iframe
                    src={embedUrl}
                    title={article.videoTitle}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <p>
                  <a
                    className="text-link"
                    href={article.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver el video <span aria-hidden="true">↗</span>
                  </a>
                </p>
              )}
            </section>
          ) : null}

          {gallery.length > 0 ? (
            <section className="article-gallery" aria-labelledby="gallery-heading">
              <h2 id="gallery-heading">Galería</h2>
              <ul className="gallery-grid">
                {gallery.map((image) => (
                  <li key={image.id}>
                    <figure>
                      <ContentImage
                        src={image.publicUrl}
                        alt={image.alt || 'Imagen de la galería'}
                        width={800}
                        height={600}
                        sizes="(max-width: 800px) 100vw, 33vw"
                      />
                      {image.alt ? <figcaption>{image.alt}</figcaption> : null}
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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

        {related.length > 0 ? (
          <section className="related-section" aria-labelledby="related-heading">
            <h2 id="related-heading">Seguí leyendo</h2>
            <div className="article-grid">
              {related.map((item) => (
                <article className="article-card" key={item.id}>
                  <Link
                    href={articlePath(item.kind as ArticleKind, item.slug)}
                    className="article-card-link"
                  >
                    <div className="article-card-meta">
                      <span>
                        {item.publishedAt?.toLocaleDateString('es-AR', { dateStyle: 'long' })}
                      </span>
                      {item.score !== null && item.kind === 'review' ? (
                        <ScoreBadge
                          score={item.score}
                          rarity={
                            item.rarityKey && item.rarityLabel && item.rarityColorToken
                              ? {
                                  key: item.rarityKey,
                                  label: item.rarityLabel,
                                  colorToken: item.rarityColorToken,
                                }
                              : null
                          }
                          compact
                        />
                      ) : null}
                    </div>
                    <h3>{item.title}</h3>
                    {item.description ? <p>{item.description}</p> : null}
                    <span className="read-more">
                      Leer artículo <span aria-hidden="true">↗</span>
                    </span>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
