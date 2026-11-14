import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { ScoreBadge } from '@/components/score-badge';
import { SearchForm } from '@/components/search-form';
import { SectionChips } from '@/components/section-chips';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';
import {
  getFeaturedArticles,
  getLibraryProgress,
  getVisibleArticles,
  type ArticleKind,
} from '@/lib/content';
import { articlePath } from '@/lib/routes';

const sections: Array<{
  kind: ArticleKind;
  title: string;
  eyebrow: string;
  description: string;
  path: string;
}> = [
  {
    kind: 'review',
    title: 'Reseñas',
    eyebrow: '01 / ANÁLISIS',
    description: 'Opiniones argumentadas, contexto y una puntuación con fundamento.',
    path: '/resenas',
  },
  {
    kind: 'news',
    title: 'Noticias',
    eyebrow: '02 / ACTUALIDAD',
    description: 'Novedades relevantes del sector, explicadas sin exageraciones.',
    path: '/noticias',
  },
  {
    kind: 'guide',
    title: 'Guías',
    eyebrow: '03 / RECURSOS',
    description: 'Información útil para jugar mejor y resolver lo que se complica.',
    path: '/guias',
  },
];

async function LatestContent() {
  await connection();
  const [reviews, news, guides] = await Promise.all([
    getVisibleArticles('review', 3),
    getVisibleArticles('news', 3),
    getVisibleArticles('guide', 3),
  ]);
  const content: Record<ArticleKind, Awaited<ReturnType<typeof getVisibleArticles>>> = {
    review: reviews,
    news,
    guide: guides,
  };

  return (
    <div className="latest-grid">
      {sections.map((section) => {
        const latest = content[section.kind][0];
        return (
          <article className="latest-card" key={section.kind}>
            <span className="eyebrow">{section.title}</span>
            {latest ? (
              <>
                <h3>
                  <Link href={articlePath(section.kind, latest.slug)}>{latest.title}</Link>
                </h3>
                {latest.description ? <p>{latest.description}</p> : null}
                <Link className="read-more" href={articlePath(section.kind, latest.slug)}>
                  Leer publicación <span aria-hidden="true">↗</span>
                </Link>
              </>
            ) : (
              <>
                <h3>En preparación</h3>
                <p>Esta colección todavía no tiene publicaciones disponibles.</p>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** Featured publications: the articles marked from the panel. */
async function FeaturedContent() {
  await connection();
  const featured = await getFeaturedArticles(3);
  if (featured.length === 0) return null;

  return (
    <section className="featured-section" aria-label="Publicaciones destacadas">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DESTACADOS</p>
          <h2>Lo que no te podés perder</h2>
        </div>
      </div>
      <div className="article-grid">
        {featured.map((article) => (
          <article className="article-card" key={article.id}>
            <Link
              href={articlePath(article.kind as ArticleKind, article.slug)}
              className="article-card-link"
            >
              <div className="article-card-meta">
                <span className="featured-badge">Destacado</span>
                {article.kind === 'review' && article.score !== null ? (
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
              <span className="read-more">
                Leer artículo <span aria-hidden="true">↗</span>
              </span>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function LatestFallback() {
  return (
    <div className="latest-grid" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">Cargando publicaciones recientes</span>
      {sections.map((section) => (
        <div className="latest-card latest-card-skeleton" key={section.kind}>
          <span className="eyebrow">{section.title}</span>
          <div className="loading-line loading-title" />
          <div className="loading-line loading-copy" />
        </div>
      ))}
    </div>
  );
}

/** "Nivel de biblioteca": how many published games already have a review. */
async function LibraryLevel() {
  await connection();
  const { total, reviewed, progress } = await getLibraryProgress();
  const missing = total - reviewed;
  const note =
    total === 0
      ? 'La biblioteca está esperando su primer juego.'
      : progress >= 100
        ? 'Logro desbloqueado: set completo de reseñas.'
        : missing === 1
          ? 'Falta reseñar 1 juego para desbloquear el logro «Set completo».'
          : `Faltan reseñar ${missing} juegos para desbloquear el logro «Set completo».`;

  return (
    <section className="library-level" aria-label="Progreso de la biblioteca">
      <div className="library-level-head">
        <p className="library-level-title">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3h8v6a4 4 0 0 1-8 0V3Z" />
            <path d="M8 4H5v2a3 3 0 0 0 3 3M16 4h3v2a3 3 0 0 1-3 3" />
            <path d="M12 13v3M9 20h6M10 16h4l1 4H9l1-4Z" />
          </svg>
          Nivel de biblioteca
        </p>
        <p className="library-level-value">
          <strong>{reviewed}</strong>/{total} reseñados
        </p>
      </div>
      <div
        className="library-level-bar"
        role="progressbar"
        aria-label="Juegos con reseña"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="library-level-note">{note}</p>
    </section>
  );
}

export default function Home() {
  return (
    <div className="site-shell" id="top">
      <SkipLink />
      <SiteHeader currentPath="/" />

      <main id="contenido" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">PUBLICACIÓN INDEPENDIENTE</p>
            <h1>
              Videojuegos,
              <br />
              <span>con criterio.</span>
            </h1>
            <p className="hero-description">
              Reseñas, noticias y guías para entender lo que jugamos. Menos ruido. Más contexto.
            </p>
            <div className="hero-search">
              <SearchForm id="hero-search" />
            </div>
            <Link className="primary-link" href="/resenas">
              Explorar reseñas <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-art-ring" />
            <div className="hero-art-core">
              N<span>.</span>
            </div>
            <span className="hero-art-label">PLAY / THINK / REPEAT</span>
          </div>
        </section>

        <section className="manifesto">
          <p className="eyebrow">EL ENFOQUE</p>
          <p className="manifesto-copy">
            No se trata de hablar de todo. Se trata de prestar atención, jugar con tiempo y contar
            algo que valga la pena leer.
          </p>
        </section>

        <section className="collections" aria-label="Colecciones editoriales">
          {sections.map((section) => (
            <Link className="collection-tile" href={section.path} key={section.kind}>
              <span className="eyebrow">{section.eyebrow}</span>
              <span className="collection-title">{section.title}</span>
              <span className="collection-description">{section.description}</span>
              <span className="collection-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </section>

        <div className="home-chips">
          <SectionChips />
        </div>

        <Suspense fallback={<div className="library-level library-level-skeleton" />}>
          <LibraryLevel />
        </Suspense>

        <Suspense fallback={null}>
          <FeaturedContent />
        </Suspense>

        <section className="latest-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LO ÚLTIMO</p>
              <h2>Lecturas recientes</h2>
            </div>
            <Link href="/resenas" className="text-link">
              Ver archivo completo <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <Suspense fallback={<LatestFallback />}>
            <LatestContent />
          </Suspense>
        </section>
      </main>

      <SiteFooter showBackToTop />
    </div>
  );
}
