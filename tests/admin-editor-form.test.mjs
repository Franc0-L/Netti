import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createEditorForm, slugifyTitle } from "../public/admin/js/editor-form.js";

function createDocument() {
  const dom = new JSDOM(`
    <section data-collections="games"><input id="field-release-year"></section>
    <section data-collections="reviews,news,guides"></section>
    <input id="field-platforms"><input id="field-genres">
    <input id="field-developer"><input id="field-publisher">
    <input id="field-published-at"><input id="field-author">
    <input id="field-category"><input id="field-source-name">
    <input id="field-source-url"><textarea id="field-score-reason"></textarea>
    <textarea id="field-verdict"></textarea><input type="checkbox" id="field-featured">
    <select id="edit-tags" multiple>
      <option value="Indie">Indie</option><option value="Recomendado">Recomendado</option>
    </select>
  `);
  return dom.window.document;
}

test("genera nombres de enlace legibles desde títulos", () => {
  assert.equal(slugifyTitle("  Crónica: Acción & Aventura! "), "cronica-accion-aventura");
  assert.equal(slugifyTitle("Pokémon: edición especial"), "pokemon-edicion-especial");
});

test("reinicia y recupera metadatos y etiquetas sin arrastrar valores", () => {
  const documentRef = createDocument();
  const editor = createEditorForm({ documentRef });
  editor.populateMetadataFields({
    releaseYear: 2024,
    platforms: ["PC", "Switch"],
    genres: ["RPG"],
    featured: true,
    tags: ["Indie"],
  });
  assert.equal(documentRef.getElementById("field-release-year").value, "2024");
  assert.equal(documentRef.getElementById("field-platforms").value, "PC, Switch");
  assert.equal(documentRef.getElementById("field-featured").checked, true);
  assert.equal(documentRef.getElementById("edit-tags").selectedOptions[0].value, "Indie");

  editor.resetMetadataFields();
  assert.equal(documentRef.getElementById("field-release-year").value, "");
  assert.equal(documentRef.getElementById("field-featured").checked, false);
  assert.equal(documentRef.getElementById("edit-tags").selectedOptions.length, 0);
});

test("muestra solo metadatos de la colección y aplica valores iniciales", () => {
  const documentRef = createDocument();
  const editor = createEditorForm({ documentRef });
  editor.setMetadataVisibility("news");
  assert.equal(documentRef.querySelector('[data-collections="games"]').hidden, true);
  assert.equal(documentRef.querySelector('[data-collections="reviews,news,guides"]').hidden, false);
  assert.equal(documentRef.getElementById("field-author").value, "Netti");
  assert.equal(documentRef.getElementById("field-category").value, "Noticias");
});

test("construye payloads por colección sin mezclar metadatos", () => {
  const documentRef = createDocument();
  const editor = createEditorForm({ documentRef });
  documentRef.getElementById("field-release-year").value = "2023";
  documentRef.getElementById("field-platforms").value = "PC, PlayStation 5";
  documentRef.getElementById("field-genres").value = "Acción, RPG";
  documentRef.getElementById("field-developer").value = "Estudio";
  documentRef.getElementById("field-featured").checked = true;
  documentRef.getElementById("edit-tags").options[0].selected = true;

  const game = editor.buildPayload({
    collection: "games", slug: "juego-demo", title: " Juego ", description: " Descripción ",
    body: " Texto ", game: "", score: "", coverAlt: " Portada ",
  });
  assert.deepEqual(game, {
    collection: "games",
    slug: "juego-demo",
    body: "Texto",
    fields: {
      title: "Juego",
      description: "Descripción",
      tags: ["Indie"],
      coverAlt: "Portada",
      releaseYear: 2023,
      platforms: ["PC", "PlayStation 5"],
      genres: ["Acción", "RPG"],
      developer: "Estudio",
      featured: true,
    },
  });

  const review = editor.buildPayload({
    collection: "reviews", slug: "review", title: "Reseña", description: "Desc",
    body: "Cuerpo", game: "juego-demo", score: "87", coverAlt: "",
  });
  assert.equal(review.fields.game, "juego-demo");
  assert.equal(review.fields.score, 87);
  assert.equal("releaseYear" in review.fields, false);
});
