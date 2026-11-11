import type { ArticleKind } from '@/lib/content.js';

const SEGMENT_TO_KIND: Record<string, ArticleKind> = {
  resenas: 'review',
  noticias: 'news',
  guias: 'guide',
};

const KIND_TO_SEGMENT: Record<ArticleKind, string> = {
  review: 'resenas',
  news: 'noticias',
  guide: 'guias',
};

export function articleKindFromSegment(segment: string): ArticleKind | null {
  return SEGMENT_TO_KIND[segment] ?? null;
}

export function articleCollectionPath(kind: ArticleKind): string {
  return `/${KIND_TO_SEGMENT[kind]}`;
}

export function articlePath(kind: ArticleKind, slug: string): string {
  return `${articleCollectionPath(kind)}/${encodeURIComponent(slug)}`;
}
