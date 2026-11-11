import assert from 'node:assert/strict';
import test from 'node:test';
import { safeCdata, safeJsonLd } from './seo.js';

test('escapes script-breaking characters in JSON-LD', () => {
  const output = safeJsonLd({ headline: '</script><script>alert(1)</script>' });
  assert.equal(output.includes('</script>'), false);
  assert.match(output, /\\u003c/);
});

test('rejects the CDATA closing sequence', () => {
  assert.throws(() => safeCdata('unsafe ]]> content'), /CDATA/);
});

test('preserves safe CDATA text', () => {
  assert.equal(safeCdata('Contenido editorial'), 'Contenido editorial');
});
