import test from "node:test";
import assert from "node:assert/strict";
import { renderCollectionList, renderTrashList, renderMediaList } from "../public/admin/js/list-views.js";

test("renderiza listado y paginación de publicaciones", () => {
  const html = renderCollectionList({
    entries: [{ collection: "games", slug: "juego-demo", sha: "abc", fields: { title: "Juego demo" } }],
    page: 2, pageCount: 3,
  });
  assert.match(html, /Juego demo/);
  assert.match(html, /data-page="1"/);
  assert.match(html, /data-page="3"/);
  assert.match(html, /data-action="edit"/);
});

test("escapa contenido editorial y atributos del listado", () => {
  const html = renderCollectionList({
    entries: [{ collection: "games", slug: 'x" onmouseover="alert(1)', sha: '"><script>', fields: { title: '<img src=x onerror=alert(1)>' } }],
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /onmouseover="alert/);
  assert.match(html, /&lt;img/);
});

test("muestra estado vacío y consulta sin interpolar HTML", () => {
  assert.match(renderCollectionList(), /Todavía no hay artículos/);
  const html = renderCollectionList({ isSearching: true, query: '<script>' });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderiza papelera con acciones de recuperación seguras", () => {
  const html = renderTrashList([{ collection: "reviews", slug: "review-demo", sha: "abc", fields: { title: "Reseña", deletedAt: "2026-11-06" } }]);
  assert.match(html, /data-action="recover"/);
  assert.match(html, /data-sha="abc"/);
  assert.match(renderTrashList([]), /papelera está vacía/);
});

test("renderiza medios y rechaza URL no segura", () => {
  const items = [
    { name: "válida", url: "/media/games/demo/cover.webp", alt: "Portada" },
    { name: "inválida", url: "javascript:alert(1)", alt: "No válida" },
  ];
  const html = renderMediaList(items);
  assert.match(html, /<img src="\/media\/games\/demo\/cover.webp"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /Sin imagen/);
});
