import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownPreview } from "../public/admin/js/markdown-preview.js";

test("renderiza formato Markdown básico", () => {
  const html = renderMarkdownPreview("# Título\n\nTexto **importante** y *énfasis*.");
  assert.match(html, /<h1>Título<\/h1>/);
  assert.match(html, /<strong>importante<\/strong>/);
  assert.match(html, /<em>énfasis<\/em>/);
});

test("escapa HTML arbitrario y evita ejecución de scripts", () => {
  const html = renderMarkdownPreview('<img src=x onerror="alert(1)"><script>alert(1)</script>');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<script|<img[^>]*onerror=/i);
});

test("rechaza esquemas peligrosos en enlaces e imágenes", () => {
  const html = renderMarkdownPreview("[abrir](javascript:alert(1))\n\n![imagen](data:text/html,evil)");
  assert.doesNotMatch(html, /href="javascript:|src="data:/i);
  assert.doesNotMatch(html, /<a |<img /i);
});

test("permite enlaces HTTPS y rutas locales de medios", () => {
  const html = renderMarkdownPreview("[sitio](https://example.com)\n\n![portada](/media/games/demo/cover.webp)");
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /src="\/media\/games\/demo\/cover\.webp"/);
});

test("devuelve un estado vacío para contenido sin texto", () => {
  assert.match(renderMarkdownPreview("  "), /preview-empty/);
});
