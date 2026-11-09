import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getVisibleArticles, type ArticleKind } from "@/lib/content";
import { articlePath } from "@/lib/routes";

const sections: Array<{
  kind: ArticleKind;
  title: string;
  eyebrow: string;
  description: string;
  path: string;
}> = [
  {
    kind: "review",
    title: "Reseñas",
    eyebrow: "01 / ANÁLISIS",
    description: "Opiniones argumentadas, contexto y una puntuación con fundamento.",
    path: "/resenas",
  },
  {
    kind: "news",
    title: "Noticias",
    eyebrow: "02 / ACTUALIDAD",
    description: "Novedades relevantes del sector, explicadas sin exageraciones.",
    path: "/noticias",
  },
  {
    kind: "guide",
    title: "Guías",
    eyebrow: "03 / RECURSOS",
    description: "Información útil para jugar mejor y resolver lo que se complica.",
    path: "/guias",
  },
];

async function LatestContent() {
  await connection();
  const [reviews, news, guides] = await Promise.all([
    getVisibleArticles("review", 3),
    getVisibleArticles("news", 3),
    getVisibleArticles("guide", 3),
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
                <h3><Link href={articlePath(section.kind, latest.slug)}>{latest.title}</Link></h3>
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

function LatestFallback() {
  return (
    <div className="latest-grid" aria-label="Cargando publicaciones" aria-busy="true">
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

export default function Home() {
  return (
    <main id="top" className="site-shell">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Netti, inicio">NETTI<span>.</span></Link>
        <nav aria-label="Navegación principal" className="site-nav">
          <Link href="/resenas">Reseñas</Link>
          <Link href="/noticias">Noticias</Link>
          <Link href="/guias">Guías</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PUBLICACIÓN INDEPENDIENTE</p>
          <h1>Videojuegos,<br /><span>con criterio.</span></h1>
          <p className="hero-description">
            Reseñas, noticias y guías para entender lo que jugamos.
            Menos ruido. Más contexto.
          </p>
          <Link className="primary-link" href="/resenas">
            Explorar reseñas <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art-ring" />
          <div className="hero-art-core">N<span>.</span></div>
          <span className="hero-art-label">PLAY / THINK / REPEAT</span>
        </div>
      </section>

      <section className="manifesto">
        <p className="eyebrow">EL ENFOQUE</p>
        <p className="manifesto-copy">
          No se trata de hablar de todo. Se trata de prestar atención,
          jugar con tiempo y contar algo que valga la pena leer.
        </p>
      </section>

      <section className="collections" aria-label="Colecciones editoriales">
        {sections.map((section) => (
          <Link className="collection-tile" href={section.path} key={section.kind}>
            <span className="eyebrow">{section.eyebrow}</span>
            <span className="collection-title">{section.title}</span>
            <span className="collection-description">{section.description}</span>
            <span className="collection-arrow" aria-hidden="true">↗</span>
          </Link>
        ))}
      </section>

      <section className="latest-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LO ÚLTIMO</p>
            <h2>Lecturas recientes</h2>
          </div>
          <Link href="/resenas" className="text-link">Ver archivo completo ↗</Link>
        </div>
        <Suspense fallback={<LatestFallback />}>
          <LatestContent />
        </Suspense>
      </section>

      <footer className="site-footer">
        <span>NETTI<span className="accent">.</span></span>
        <span>Videojuegos, con criterio.</span>
        <a href="#top">Volver arriba ↑</a>
      </footer>
    </main>
  );
}
