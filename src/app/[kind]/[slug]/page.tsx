import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownContent } from "@/components/markdown-content.js";
import { getArticle } from "@/lib/content.js";
import { articleCollectionPath, articleKindFromSegment } from "@/lib/routes.js";

type PageProps = {
  params: Promise<{ kind: string; slug: string }>;
};

const COLLECTION_TITLES = {
  review: "Reseñas",
  news: "Noticias",
  guide: "Guías",
} as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: segment, slug } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) return { title: "Artículo no encontrado | Netti" };

  const article = await getArticle(kind, slug);
  if (!article) return { title: "Artículo no encontrado | Netti" };

  return {
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.description || undefined,
    openGraph: {
      type: "article",
      title: article.seoTitle || article.title,
      description: article.seoDescription || article.description || undefined,
      publishedTime: article.publishedAt?.toISOString(),
      authors: article.author ? [article.author] : undefined,
      images: article.coverImageUrl ? [{ url: article.coverImageUrl, alt: article.coverAlt || article.title }] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { kind: segment, slug } = await params;
  const kind = articleKindFromSegment(segment);
  if (!kind) notFound();

  const article = await getArticle(kind, slug);
  if (!article) notFound();

  const collectionPath = articleCollectionPath(kind);
  const publishedDate = article.publishedAt?.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
      <article className="article-page">
        <Link href={collectionPath} className="back-link">← {COLLECTION_TITLES[kind]}</Link>
        <header className="article-header">
          <p className="eyebrow">{COLLECTION_TITLES[kind]}</p>
          <h1>{article.title}</h1>
          {article.description ? <p className="article-deck">{article.description}</p> : null}
          <div className="article-byline">
            {article.author ? <span>{article.author}</span> : <span>Netti</span>}
            {publishedDate ? <span>{publishedDate}</span> : null}
            {kind === "review" && article.score !== null ? <strong>{article.score}/10</strong> : null}
          </div>
        </header>
        {article.coverImageUrl ? (
          <figure className="article-cover">
            <img src={article.coverImageUrl} alt={article.coverAlt || article.title} />
          </figure>
        ) : null}
        <MarkdownContent source={article.body} />
        {kind === "review" && article.verdict ? (
          <aside className="verdict">
            <p className="eyebrow">VEREDICTO</p>
            <p>{article.verdict}</p>
          </aside>
        ) : null}
        {article.tags.length > 0 ? (
          <div className="tag-list article-tags">
            {article.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : null}
      </article>
      <footer className="site-footer">
        <span>NETTI<span className="accent">.</span></span>
        <span>Videojuegos, con criterio.</span>
      </footer>
    </main>
  );
}
