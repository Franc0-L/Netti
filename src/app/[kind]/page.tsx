import Link from "next/link";
import { notFound } from "next/navigation";
import { getVisibleArticles } from "@/lib/content.js";
import { articleKindFromSegment, articlePath } from "@/lib/routes.js";

const COLLECTIONS = {
  resenas: { title: "Reseñas", description: "Análisis y opiniones sobre videojuegos." },
  noticias: { title: "Noticias", description: "Novedades del mundo de los videojuegos." },
  guias: { title: "Guías", description: "Guías, consejos y soluciones." },
} as const;

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: segment } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) notFound();

  const collection = COLLECTIONS[segment as keyof typeof COLLECTIONS];
  const articles = await getVisibleArticles(kind, 30);

  return (
    <main className="site-shell">
      <header className="site-header">
        <Link className="wordmark" href="/">NETTI<span>.</span></Link>
        <nav aria-label="Navegación principal" className="site-nav">
          <Link href="/resenas">Reseñas</Link>
          <Link href="/noticias">Noticias</Link>
          <Link href="/guias">Guías</Link>
        </nav>
      </header>
      <section className="collection-heading">
        <p className="eyebrow">ARCHIVO EDITORIAL</p>
        <h1>{collection.title}</h1>
        <p>{collection.description}</p>
      </section>
      {articles.length === 0 ? (
        <div className="empty-state">
          <span className="empty-mark">N.</span>
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
                  <span>{article.publishedAt?.toLocaleDateString("es-AR", { dateStyle: "long" })}</span>
                  {kind === "review" && article.score !== null ? <span>{article.score}/10</span> : null}
                </div>
                <h2>{article.title}</h2>
                {article.description ? <p>{article.description}</p> : null}
                {article.tags.length > 0 ? (
                  <div className="tag-list">
                    {article.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                ) : null}
                <span className="read-more">Leer artículo <span aria-hidden="true">↗</span></span>
              </Link>
            </article>
          ))}
        </section>
      )}
      <footer className="site-footer">
        <span>NETTI<span className="accent">.</span></span>
        <span>Videojuegos, con criterio.</span>
      </footer>
    </main>
  );
}
