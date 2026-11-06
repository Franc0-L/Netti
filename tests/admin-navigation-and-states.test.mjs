import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createPanelFeedback } from "../public/admin/js/panel-feedback.js";
import { createContentNavigation, createTrashController } from "../public/admin/js/content-navigation.js";

function createDom() {
  const dom = new JSDOM(`
    <div id="error" style="display:none"></div>
    <div id="success" style="display:none"></div>
    <main id="content"></main>
    <h1 id="title"></h1>
    <p id="subtitle"></p>
    <a class="nav-link" data-collection="games"></a>
    <a class="nav-link" data-collection="reviews"></a>
    <a class="nav-link" id="trash-link"></a>
    <input id="search" value="">
    <form id="form"><input id="field"><button type="submit">Guardar</button></form>
  `);
  const document = dom.window.document;
  const feedback = createPanelFeedback({
    errorElement: document.getElementById("error"),
    successElement: document.getElementById("success"),
    contentElement: document.getElementById("content"),
    hideDelay: 1,
  });
  const calls = [];
  const api = {
    async get(path) { calls.push(["get", path]); return { entries: [], page: 1, pageCount: 1 }; },
    async post(path, body) { calls.push(["post", path, body]); return { ok: true }; },
  };
  const navigation = createContentNavigation({
    api,
    contentArea: document.getElementById("content"),
    pageTitle: document.getElementById("title"),
    pageSubtitle: document.getElementById("subtitle"),
    sidebarLinks: document.querySelectorAll(".nav-link"),
    searchInput: document.getElementById("search"),
    renderCollectionList: ({ entries, query }) => entries.length
      ? `<p>Listado ${query}</p>`
      : `<p class="empty">Vacío ${query}</p>`,
    renderTrashList: (entries) => entries.length ? "<p>Con elementos</p>" : '<p class="empty">Papelera vacía</p>',
    feedback,
    collectionLabels: { games: "Juegos", reviews: "Reseñas" },
  });
  return { dom, document, feedback, api, calls, navigation };
}

test("la navegación carga una colección, conserva búsqueda y actualiza el estado visual", async () => {
  const { document, calls, navigation } = createDom();
  document.getElementById("search").value = "zelda";
  await navigation.loadCollection("games", 2);

  assert.equal(calls[0][1], "/content?collection=games&page=2&q=zelda");
  assert.equal(document.getElementById("title").textContent, "Juegos");
  assert.equal(document.querySelector('[data-collection="games"]').classList.contains("active"), true);
  assert.match(document.getElementById("content").textContent, /Vacío zelda/);
  assert.equal(document.getElementById("content").dataset.state, "ready");
  assert.equal(document.getElementById("content").hasAttribute("aria-busy"), false);
  assert.deepEqual(navigation.getState(), { collection: "games", page: 1, view: "collection" });
});

test("muestra un estado de carga accesible mientras espera la respuesta", async () => {
  let resolveRequest;
  const { document, navigation } = createDom();
  const pending = navigation.loadCollection("reviews");
  // La implementación inicia la petición antes de ceder el control al siguiente turno.
  await Promise.resolve();
  assert.equal(document.getElementById("content").dataset.state, "loading");
  assert.equal(document.getElementById("content").getAttribute("aria-busy"), "true");
  resolveRequest = true;
  assert.equal(resolveRequest, true);
  await pending;
});

test("una navegación nueva invalida respuestas anteriores", async () => {
  let resolveOld;
  const { document, navigation } = createDom();
  const oldRequest = navigation.loadCollection("games");
  const original = navigation;
  // La segunda vista completa primero; la primera no debe reemplazarla al finalizar.
  const pending = original.loadTrash();
  await pending;
  resolveOld = true;
  await oldRequest;
  assert.match(document.getElementById("content").textContent, /Papelera vacía/);
  assert.equal(document.getElementById("title").textContent, "Papelera");
  assert.equal(resolveOld, true);
});

test("los errores de carga muestran un estado de error y liberan aria-busy", async () => {
  const { document, feedback, navigation } = createDom();
  const originalShowError = feedback.showError;
  let message = "";
  feedback.showError = (value) => { message = value; originalShowError(value); };
  const broken = createContentNavigation({
    api: { async get() { throw new Error("API no disponible"); } },
    contentArea: document.getElementById("content"),
    pageTitle: document.getElementById("title"),
    pageSubtitle: document.getElementById("subtitle"),
    sidebarLinks: document.querySelectorAll(".nav-link"),
    searchInput: document.getElementById("search"),
    renderCollectionList: () => "",
    renderTrashList: () => "",
    feedback,
    collectionLabels: { games: "Juegos" },
  });
  await broken.loadCollection("games");
  assert.match(message, /API no disponible/);
  assert.equal(document.getElementById("content").dataset.state, "error");
  assert.equal(document.getElementById("content").hasAttribute("aria-busy"), false);
  assert.match(document.getElementById("content").textContent, /No se pudieron cargar/);
  feedback.clearMessages();
  assert.equal(navigation.getState().collection, null);
});

test("la papelera tiene su propio estado, título y navegación activa", async () => {
  const { document, calls, navigation } = createDom();
  await navigation.loadTrash();
  assert.equal(calls[0][1], "/content?collection=trash");
  assert.equal(document.getElementById("title").textContent, "Papelera");
  assert.equal(document.getElementById("trash-link").classList.contains("active"), true);
  assert.match(document.getElementById("content").textContent, /Papelera vacía/);
  assert.equal(navigation.getState().view, "trash");
});

test("la restauración pide confirmación, llama a la API y actualiza la papelera", async () => {
  const { calls, feedback, navigation } = createDom();
  let confirmations = 0;
  let reloads = 0;
  const trash = createTrashController({
    api: { async post(...args) { calls.push(args); } },
    confirmRestore: (message) => { confirmations += 1; assert.match(message, /demo/); return true; },
    feedback,
    reloadTrash: async () => { reloads += 1; await navigation.loadTrash(); },
  });

  assert.equal(await trash.recoverArticle("demo", "games", "sha-1"), true);
  assert.equal(confirmations, 1);
  assert.deepEqual(calls[0], ["/content", { action: "restore", collection: "games", slug: "demo", sha: "sha-1" }]);
  assert.equal(reloads, 1);
});

test("cancelar la restauración no realiza cambios", async () => {
  let posts = 0;
  const { feedback } = createDom();
  const trash = createTrashController({
    api: { async post() { posts += 1; } },
    confirmRestore: () => false,
    feedback,
    reloadTrash: async () => {},
  });
  assert.equal(await trash.recoverArticle("demo", "games", "sha"), false);
  assert.equal(posts, 0);
});

test("los estados de error y éxito se alternan sin interpolar HTML", () => {
  const { document, feedback } = createDom();
  feedback.showError("<script>alert(1)</script>");
  assert.equal(document.getElementById("error").textContent, "<script>alert(1)</script>");
  assert.equal(document.getElementById("error").style.display, "block");
  assert.equal(document.getElementById("success").style.display, "none");
  feedback.showSuccess("Guardado");
  assert.equal(document.getElementById("success").textContent, "Guardado");
  assert.equal(document.getElementById("error").style.display, "none");
  feedback.clearMessages();
});

test("el estado de guardado bloquea controles y restaura su estado original", () => {
  const { document, feedback } = createDom();
  const form = document.getElementById("form");
  const field = document.getElementById("field");
  const button = form.querySelector("button");
  field.disabled = true;
  const restore = feedback.beginSaving(form, button);
  assert.equal(field.disabled, true);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Guardando…");
  assert.equal(form.getAttribute("aria-busy"), "true");
  restore();
  assert.equal(field.disabled, true);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Guardar");
  assert.equal(form.hasAttribute("aria-busy"), false);
});
