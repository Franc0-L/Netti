import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createEditorState } from "../public/admin/js/editor-state.js";

function createForm() {
  const dom = new JSDOM(`
    <form id="editor">
      <input id="title" value="Título inicial">
      <textarea id="body">Texto inicial</textarea>
      <input id="featured" type="checkbox" value="yes">
      <select id="tags" multiple>
        <option value="Indie">Indie</option>
        <option value="RPG">RPG</option>
      </select>
      <input id="cover" type="file">
      <button type="submit">Guardar</button>
    </form>
  `);
  return dom.window.document.getElementById("editor");
}

test("un formulario sin cambios no se considera sucio ni pide confirmación", () => {
  const form = createForm();
  let confirmations = 0;
  const state = createEditorState({
    form,
    confirmDiscard: () => {
      confirmations += 1;
      return false;
    },
  });

  assert.equal(state.hasUnsavedChanges(), false);
  assert.equal(state.confirmClose(), true);
  assert.equal(confirmations, 0);
});

test("detecta cambios en texto, checks y etiquetas múltiples", () => {
  const form = createForm();
  const state = createEditorState({ form, confirmDiscard: () => true });

  form.querySelector("#title").value = "Título editado";
  assert.equal(state.hasUnsavedChanges(), true);
  form.querySelector("#title").value = "Título inicial";
  form.querySelector("#featured").checked = true;
  assert.equal(state.hasUnsavedChanges(), true);
  form.querySelector("#featured").checked = false;
  form.querySelector("#tags").options[1].selected = true;
  assert.equal(state.hasUnsavedChanges(), true);
});

test("confirmar descarte permite cerrar y cancelar descarte mantiene el editor abierto", () => {
  const form = createForm();
  form.querySelector("#body").value = "Cambios pendientes";

  const rejected = createEditorState({
    form,
    confirmDiscard: () => false,
  });
  assert.equal(rejected.confirmClose(), false);

  const accepted = createEditorState({
    form,
    confirmDiscard: () => true,
  });
  assert.equal(accepted.confirmClose(), true);
});

test("markClean establece una nueva referencia después de guardar o abrir otro artículo", () => {
  const form = createForm();
  const state = createEditorState({ form });
  form.querySelector("#title").value = "Nuevo artículo";
  assert.equal(state.hasUnsavedChanges(), true);

  state.markClean();
  assert.equal(state.hasUnsavedChanges(), false);
  form.querySelector("#body").value = "Más cambios";
  assert.equal(state.hasUnsavedChanges(), true);
});

test("los cambios de imagen externos también se incluyen en el estado", () => {
  const form = createForm();
  let image = { url: "/media/cover.webp", file: null };
  const state = createEditorState({ form, getExtraState: () => image });

  image = { url: null, file: { name: "nueva.png", size: 1024 } };
  assert.equal(state.hasUnsavedChanges(), true);
  state.markClean();
  assert.equal(state.hasUnsavedChanges(), false);
});

test("beforeunload bloquea la salida solo cuando hay cambios pendientes", () => {
  const form = createForm();
  const state = createEditorState({ form });
  const cleanEvent = { prevented: false, preventDefault() { this.prevented = true; } };

  state.handleBeforeUnload(cleanEvent);
  assert.equal(cleanEvent.prevented, false);

  form.querySelector("#title").value = "Sin guardar";
  const dirtyEvent = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
  state.handleBeforeUnload(dirtyEvent);
  assert.equal(dirtyEvent.prevented, true);
  assert.equal(dirtyEvent.returnValue, "");
});
