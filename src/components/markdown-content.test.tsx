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

test('resolves media references to stored URLs with responsive variants', () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownContent, {
      source: '![Captura](media:12)',
      media: {
        12: {
          id: 12,
          publicUrl: 'https://blob.example/media/12.webp',
          width: 1600,
          height: 900,
          alt: 'Captura del juego',
          variants: [
            { width: 640, publicUrl: 'https://blob.example/media/12-640.webp' },
            { width: 960, publicUrl: 'https://blob.example/media/12-960.webp' },
          ],
        },
      },
    })
  );

  assert.match(html, /src="https:\/\/blob\.example\/media\/12\.webp"/);
  assert.match(html, /srcSet="https:\/\/blob\.example\/media\/12-640\.webp 640w/i);
  assert.match(html, /alt="Captura"/);
});

test('does not render a media reference that is missing from the trusted map', () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownContent, {
      source: '![Captura](media:999)\n\nTexto editorial',
      media: {},
    })
  );

  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('Texto editorial'), true);
});
