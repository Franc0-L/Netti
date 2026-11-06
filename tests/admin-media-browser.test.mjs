import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createMediaBrowser } from "../public/admin/js/media-browser.js";

function setup({ api, onInsert = () => {}, onError = () => {}, onSuccess = () => {} } = {}) {
  const dom = new JSDOM(`
    <div id="overlay" style="display:none"></div>
    <input id="search">
    <div id="list"></div>
    <button id="insert" disabled>Insertar en el cuerpo</button>
  `);
  const document = dom.window.document;
  const mediaList = document.getElementById("list");
  const browser = createMediaBrowser({
    api: api || { async get() { return { entries: [] }; } },
    mediaModalOverlay: document.getElementById("overlay"),
    mediaSearch: document.getElementById("search"),
    mediaList,
    insertButton: document.getElementById("insert"),
    renderList: (items, allItems) => items.map((item) =>
      `<button class="media-item" data-media-index="${allItems.indexOf(item)}">${item.name}</button>`
    ).join("") || '<p class="empty">No hay imágenes</p>',
    onInsert,
    onError,
    onSuccess,
    documentRef: document,
  });
  return { browser, document, mediaList };
}

test("carga y normaliza medios desde la API", async () => {
  const { browser } = setup({
    api: { async get() { return { entries: [
      { slug: "portada", fields: { title: "Portada", coverImage: "/media/games/portada/cover.webp", coverAlt: "Arte" } },
    ] }; } },
  });

  const items = await browser.load();
  assert.deepEqual(items, [{ name: "Portada", url: "/media/games/portada/cover.webp", alt: "Arte", slug: "portada" }]);
});

test("filtra sin perder los índices originales y selecciona una imagen", async () => {
  const { browser, document, mediaList } = setup({
    api: { async get() { return { entries: [
      { slug: "uno", fields: { title: "Primera", coverImage: "/media/games/uno/cover.webp", coverAlt: "Uno" } },
      { slug: "dos", fields: { title: "Segunda", coverImage: "/media/games/dos/cover.webp", coverAlt: "Dos" } },
    ] }; } },
  });
  await browser.load();

  const search = document.getElementById("search");
  search.value = "seg";
  search.dispatchEvent(new document.defaultView.Event("input"));
  assert.equal(mediaList.querySelectorAll(".media-item").length, 1);
  const selected = mediaList.querySelector('[data-media-index="1"]');
  selected.click();

  assert.deepEqual(browser.getSelected(), { url: "/media/games/dos/cover.webp", alt: "Dos" });
  assert.equal(selected.classList.contains("selected"), true);
  assert.equal(document.getElementById("insert").disabled, false);
});

test("inserta Markdown mediante callback, cierra el modal y notifica éxito", async () => {
  const inserted = [];
  const successes = [];
  const { browser, document } = setup({
    api: { async get() { return { entries: [
      { slug: "demo", fields: { title: "Demo", coverImage: "/media/games/demo/cover.webp", coverAlt: "Arte demo" } },
    ] }; } },
    onInsert: (markdown) => inserted.push(markdown),
    onSuccess: (message) => successes.push(message),
  });
  await browser.open();
  document.querySelector(".media-item").click();
  assert.equal(browser.insertSelected(), true);

  assert.deepEqual(inserted, ["![Arte demo](/media/demo.webp)\n\n"]);
  assert.equal(document.getElementById("overlay").style.display, "none");
  assert.deepEqual(successes, ["Imagen insertada en el cuerpo"]);
});

test("rechaza rutas inseguras y no habilita la inserción", async () => {
  const errors = [];
  const { browser, document } = setup({
    api: { async get() { return { entries: [
      { slug: "mal", fields: { title: "Mal", coverImage: "javascript:alert(1)", coverAlt: "No" } },
    ] }; } },
    onError: (error) => errors.push(error.message),
  });
  await browser.load();
  document.querySelector(".media-item").click();

  assert.equal(browser.getSelected(), null);
  assert.equal(document.getElementById("insert").disabled, true);
  assert.match(errors[0], /ruta válida/);
});

test("maneja errores de API y deja el navegador en estado vacío", async () => {
  const errors = [];
  const { browser, mediaList } = setup({
    api: { async get() { throw new Error("Sin conexión"); } },
    onError: (error) => errors.push(error.message),
  });
  await browser.load();

  assert.equal(errors[0], "Sin conexión");
  assert.match(mediaList.textContent, /No hay imágenes/);
});

test("ignora respuestas antiguas cuando se solapan dos cargas", async () => {
  let resolveFirst;
  let calls = 0;
  const api = {
    get() {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      return Promise.resolve({ entries: [
        { slug: "nuevo", fields: { title: "Nuevo", coverImage: "/media/games/nuevo/cover.webp" } },
      ] });
    },
  };
  const { browser } = setup({ api });
  const first = browser.load();
  await browser.load();
  resolveFirst({ entries: [
    { slug: "viejo", fields: { title: "Viejo", coverImage: "/media/games/viejo/cover.webp" } },
  ] });
  await first;

  assert.equal(browser.getItems()[0].slug, "nuevo");
});

test("agrega al principio un medio recién subido y evita duplicar su URL", () => {
  const { browser } = setup();
  assert.equal(browser.addItem({ name: "Primero", url: "/media/games/uno/cover.webp", alt: "Uno" }), true);
  assert.equal(browser.addItem({ name: "Renombrado", url: "/media/games/uno/cover.webp", alt: "Uno" }), true);
  assert.equal(browser.getItems().length, 1);
  assert.equal(browser.getItems()[0].name, "Renombrado");
  assert.equal(browser.addItem({ name: "Inseguro", url: "javascript:alert(1)" }), false);
});
