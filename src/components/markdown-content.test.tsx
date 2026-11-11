import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent } from './markdown-content.js';

test('does not render raw HTML from editorial Markdown', () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownContent, {
      source: '<script>alert(1)</script>\n\nTexto editorial',
    })
  );

  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('alert(1)'), false);
  assert.equal(html.includes('Texto editorial'), true);
});

test('removes javascript URLs from Markdown links', () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownContent, {
      source: '[enlace](javascript:alert(1))',
    })
  );

  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('alert(1)'), false);
});

test('marks external links as non-opener and nofollow', () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownContent, {
      source: '[fuente](https://example.com)',
    })
  );

  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});
