import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedTags, type ArticleTagState } from './tags.js';

const article = (overrides: Partial<ArticleTagState> = {}): ArticleTagState => ({
  id: 1,
  kind: 'review',
  slug: 'juego',
  status: 'published',
  publishedAt: new Date('2026-11-09T12:00:00Z'),
  featured: true,
  tags: ['rpg', 'accion'],
  title: 'Juego',
  description: '',
  coverMediaId: null,
  gameId: 4,
  score: 8,
  ...overrides,
});

test('invalidates both old and new article identities and metadata', () => {
  const tags = affectedTags(
    article(),
    article({ slug: 'juego-2', tags: ['rpg', 'indie'], featured: false, gameId: 5 })
  );
  assert.deepEqual(
    new Set(tags),
    new Set([
      'article:review:juego',
      'kind:review',
      'articles',
      'tag:rpg',
      'tag:accion',
      'home',
      'game:4',
      'article:review:juego-2',
      'tag:indie',
      'game:5',
    ])
  );
});

test('returns no tags when neither article exists', () => {
  assert.deepEqual(affectedTags(null, null), []);
});
