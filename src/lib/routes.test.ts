import assert from 'node:assert/strict';
import test from 'node:test';
import { articleCollectionPath, articleKindFromSegment, articlePath } from './routes.js';

test('maps public collection segments to domain kinds', () => {
  assert.equal(articleKindFromSegment('resenas'), 'review');
  assert.equal(articleKindFromSegment('noticias'), 'news');
  assert.equal(articleKindFromSegment('guias'), 'guide');
  assert.equal(articleKindFromSegment('admin'), null);
});

test('builds canonical paths for each article kind', () => {
  assert.equal(articleCollectionPath('review'), '/resenas');
  assert.equal(articlePath('news', 'lanzamiento-importante'), '/noticias/lanzamiento-importante');
  assert.equal(articlePath('guide', 'guia con espacios'), '/guias/guia%20con%20espacios');
});
