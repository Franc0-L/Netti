import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeLike, firstParam, firstParamText } from './search-params.js';

test('returns an empty string when the parameter is missing', () => {
  assert.equal(firstParam(undefined), '');
  assert.equal(firstParamText(undefined), '');
});

test('keeps a single value', () => {
  assert.equal(firstParam('noticias'), 'noticias');
  assert.equal(firstParamText('  hardware  '), 'hardware');
});

test('takes the first value of a repeated parameter', () => {
  assert.equal(firstParam(['hardware', 'software']), 'hardware');
  assert.equal(firstParamText(['  hardware ', 'software']), 'hardware');
});

test('bounds the length of the value', () => {
  assert.equal(firstParamText('x'.repeat(200)).length, 80);
  assert.equal(firstParamText('x'.repeat(200), 10).length, 10);
});

test('does not throw on an empty array', () => {
  assert.equal(firstParam([]), '');
  assert.equal(firstParamText([]), '');
});

test('escapes LIKE wildcards so they match literally', () => {
  assert.equal(escapeLike('100%'), '100\\%');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('back\\slash'), 'back\\\\slash');
  assert.equal(escapeLike('nintendo switch'), 'nintendo switch');
});
