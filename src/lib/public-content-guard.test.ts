import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeRedirectTarget } from './public-content-guard.js';

test('accepts internal absolute redirect targets with a supported status', () => {
  assert.equal(isSafeRedirectTarget('/resenas/juego-b', 308), true);
  assert.equal(isSafeRedirectTarget('/noticias/nota', 301), true);
});

test('rejects external, protocol-relative and control-character targets', () => {
  assert.equal(isSafeRedirectTarget('https://evil.example', 308), false);
  assert.equal(isSafeRedirectTarget('//evil.example', 308), false);
  assert.equal(isSafeRedirectTarget('/ruta\\atras', 308), false);
  assert.equal(isSafeRedirectTarget('/ruta?x=1', 308), false);
  assert.equal(isSafeRedirectTarget('/ruta#frag', 308), false);
  assert.equal(isSafeRedirectTarget('/ruta\u0000', 308), false);
});

test('rejects status codes outside the redirect allow-list', () => {
  assert.equal(isSafeRedirectTarget('/resenas/juego-b', 200), false);
  assert.equal(isSafeRedirectTarget('/resenas/juego-b', 418), false);
});
