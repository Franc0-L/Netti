import assert from 'node:assert/strict';
import test from 'node:test';
import { documentMatches, normalizeSearchText, searchDocuments, searchHaystack } from './search.js';

const documents = [
  { title: 'Pokémon Escarlata', description: 'La nueva aventura', tags: ['Nintendo'] },
  { title: 'Hollow Knight', description: 'Un metroidvania', tags: ['Plataformas', 'indie'] },
  { title: 'Noticia', description: 'Anuncio de la semana', tags: ['Hardware'] },
];

test('normalizes accents and case', () => {
  assert.equal(normalizeSearchText('Pokémon'), 'pokemon');
  assert.equal(normalizeSearchText('  HOLLOW KNIGHT '), 'hollow knight');
});

test('matches ignoring accents', () => {
  assert.equal(documentMatches(documents[0], 'pokemon'), true);
  assert.equal(documentMatches(documents[0], 'pokémon'), true);
  assert.equal(documentMatches(documents[0], 'Pokémon Escarlata'), true);
});

test('matches title, description and tags', () => {
  assert.equal(documentMatches(documents[1], 'metroidvania'), true);
  assert.equal(documentMatches(documents[2], 'hardware'), true);
  assert.equal(documentMatches(documents[2], 'anuncio'), true);
});

test('rejects documents without the term', () => {
  assert.equal(documentMatches(documents[0], 'hollow'), false);
});

test('an empty query matches everything', () => {
  assert.equal(documentMatches(documents[0], ''), true);
});

test('the title is weighted twice in the haystack', () => {
  const haystack = searchHaystack({ title: 'abc', description: '', tags: [] });
  assert.equal(haystack.split('abc').length - 1, 2);
});

test('filters and paginates the results', () => {
  const page = searchDocuments(documents, 'a', 2, 0);
  assert.equal(page.total, 3);
  assert.equal(page.results.length, 2);

  const second = searchDocuments(documents, 'a', 2, 2);
  assert.equal(second.total, 3);
  assert.equal(second.results.length, 1);
  assert.notEqual(second.results[0]?.title, page.results[0]?.title);
});

test('clamps the limit and the offset', () => {
  assert.equal(searchDocuments(documents, '', 0).results.length, 1);
  assert.equal(searchDocuments(documents, '', 999).results.length, 3);
  assert.equal(searchDocuments(documents, '', 20, -5).results.length, 3);
});
