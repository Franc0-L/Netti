import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentImage } from '@/components/content-image';
import { MarkdownContent } from '@/components/markdown-content';
import { PlatformIcons } from '@/components/platform-icons';
import { ScoreBadge } from '@/components/score-badge';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import { getBodyMedia, getGame, getGameReviews } from '@/lib/content';
import { articlePath } from '@/lib/routes';
import { safeJsonLd } from '@/lib/seo';

/**
 * Blocking route: the sheet depends on runtime params, so `notFound()` can
 * answer with a 404 status instead of a prerendered shell.
 */
export const instant = false;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: 'Juego no encontrado | Netti' };

  const siteUrl = process.env.PUBLIC_SITE_URL;
  const canonical = siteUrl ? new URL(`/juegos/${slug}`, siteUrl).toString() : undefined;

  return {
    title: `${game.title} | Juegos`,
    description: game.description || undefined,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: 'website',
      title: game.title,
      description: game.description || undefined,
      url: canonical,
      images: game.coverImageUrl
        ? [{ url: game.coverImageUrl, alt: game.coverAlt || game.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: game.title,
      description: game.description || undefined,
      images: game.coverImageUrl
        ? [{ url: game.coverImageUrl, alt: game.coverAlt || game.title }]
        : undefined,
    },
  };
}

export default async function GamePage({ params }: PageProps) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  const [reviews, bodyMedia] = await Promise.all([
    getGameReviews(game.id),
    getBodyMedia(game.body),
  ]);
  const siteUrl = process.env.PUBLIC_SITE_URL;
  const gameUrl = siteUrl ? new URL(`/juegos/${game.slug}`, siteUrl).toString() : undefined;
  const releaseDate = game.releaseDate?.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    description: game.description || undefined,
    image: game.coverImageUrl ? [game.coverImageUrl] : undefined,
    datePublished: game.releaseDate?.toISOString(),
    author: game.developer ? { '@type': 'Organization', name: game.developer } : undefined,
    publisher: game.publisher ? { '@type': 'Organization', name: game.publisher } : undefined,
    gamePlatform: game.platforms.length > 0 ? game.platforms : undefined,
    genre: game.genres.length > 0 ? game.genres : undefined,
    url: gameUrl,
  };

  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath="/juegos" />
      <main id="contenido" tabIndex={-1}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
        <article className="article-page game-page">
          <Link href="/juegos" className="back-link">
            <span aria-hidden="true">←</span> Juegos
          </Link>
          <header className="article-header">
            <p className="eyebrow">FICHA DE JUEGO</p>
            <h1>{game.title}</h1>
            {game.description ? <p className="article-deck">{game.description}</p> : null}
            <div className="article-byline">
              {game.developer ? <span>{game.developer}</span> : null}
              {game.publisher ? <span>{game.publisher}</span> : null}
              {releaseDate ? (
                <span>
                  <time dateTime={game.releaseDate?.toISOString()}>{releaseDate}</time>
                </span>
              ) : null}
            </div>
          </header>

          {game.coverImageUrl ? (
            <figure className="article-cover">
              <ContentImage
                src={game.coverImageUrl}
                alt={game.coverAlt || game.title}
                width={1600}
                height={900}
                sizes="100vw"
              />
            </figure>
          ) : null}

          <div className="game-facts">
            <div>
              <h2>Plataformas</h2>
              {game.platforms.length > 0 ? (
                <>
                  <PlatformIcons platforms={game.platforms} />
                  <p className="tag-list">
                    {game.platforms.map((platform) => (
                      <span key={platform}>{platform}</span>
                    ))}
                  </p>
                </>
              ) : (
                <p className="admin-muted">Sin datos.</p>
              )}
            </div>
            <div>
              <h2>Géneros</h2>
              {game.genres.length > 0 ? (
                <p className="tag-list">
                  {game.genres.map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </p>
              ) : (
                <p className="admin-muted">Sin datos.</p>
              )}
            </div>
            <div>
              <h2>Etiquetas</h2>
              {game.tags.length > 0 ? (
                <p className="tag-list">
                  {game.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </p>
              ) : (
                <p className="admin-muted">Sin datos.</p>
              )}
            </div>
          </div>

          {game.body.trim() ? <MarkdownContent source={game.body} media={bodyMedia} /> : null}

          <section className="related-section" aria-labelledby="game-reviews-heading">
            <h2 id="game-reviews-heading">Reseñas de este juego</h2>
            {reviews.length === 0 ? (
              <p className="admin-muted">Todavía no hay una reseña publicada de este juego.</p>
            ) : (
              <div className="article-grid">
                {reviews.map((review) => (
                  <article className="article-card" key={review.id}>
                    <Link href={articlePath('review', review.slug)} className="article-card-link">
                      <div className="article-card-meta">
                        <span>
                          {review.publishedAt?.toLocaleDateString('es-AR', { dateStyle: 'long' })}
                        </span>
                        {review.score !== null ? (
                          <ScoreBadge
                            score={review.score}
                            rarity={
                              review.rarityKey && review.rarityLabel && review.rarityColorToken
                                ? {
                                    key: review.rarityKey,
                                    label: review.rarityLabel,
                                    colorToken: review.rarityColorToken,
                                  }
                                : null
                            }
                            compact
                          />
                        ) : null}
                      </div>
                      <h3>{review.title}</h3>
                      {review.description ? <p>{review.description}</p> : null}
                      <span className="read-more">
                        Leer reseña <span aria-hidden="true">↗</span>
                      </span>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
