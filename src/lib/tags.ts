export type ArticleKind = 'review' | 'news' | 'guide';
export type ContentStatus = 'draft' | 'published' | 'trashed';

export interface ArticleTagState {
  id: number;
  kind: ArticleKind;
  slug: string;
  status: ContentStatus;
  publishedAt: Date | null;
  featured: boolean;
  tags: string[];
  title: string;
  description: string;
  coverMediaId: number | null;
  gameId: number | null;
  score: number | null;
}

export function affectedTags(
  before: ArticleTagState | null,
  after: ArticleTagState | null
): string[] {
  const tags = new Set<string>();

  if (before) {
    tags.add(`article:${before.kind}:${before.slug}`);
    tags.add(`kind:${before.kind}`);
    tags.add('articles');
    before.tags.forEach((t) => tags.add(`tag:${t}`));
    if (before.featured) tags.add('home');
    if (before.gameId) tags.add(`game:${before.gameId}`);
  }

  if (after) {
    tags.add(`article:${after.kind}:${after.slug}`);
    tags.add(`kind:${after.kind}`);
    tags.add('articles');
    after.tags.forEach((t) => tags.add(`tag:${t}`));
    if (after.featured) tags.add('home');
    if (after.gameId) tags.add(`game:${after.gameId}`);
  }

  return Array.from(tags);
}
