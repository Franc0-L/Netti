function readControl(control, index) {
  const type = String(control.type || "").toLowerCase();
  if (["button", "submit", "reset"].includes(type)) return null;

  const key = control.id || control.name || `control-${index}`;
  if (type === "checkbox" || type === "radio") {
    return [key, { checked: control.checked, value: control.value }];
  }
  if (type === "file") {
    return [key, control.value || ""];
  }
  if (control.tagName === "SELECT" && control.multiple) {
    return [
      key,
      Array.from(control.options)
        .filter((option) => option.selected)
        .map((option) => option.value),
    ];
  }
  if ("value" in control) return [key, control.value];
  return null;
}

export function createEditorState({
  form,
  getExtraState = () => null,
  confirmDiscard = (message) => globalThis.confirm(message),
} = {}) {
  if (!form?.elements) {
    throw new TypeError("Se necesita un formulario válido para controlar cambios.");
  }

  let baseline = "";

  function snapshot() {
    const fields = Array.from(form.elements)
      .map(readControl)
      .filter(Boolean);
    return JSON.stringify({ fields, extra: getExtraState() });
  }

  function markClean() {
    baseline = snapshot();
  }

  function hasUnsavedChanges() {
    return snapshot() !== baseline;
  }

  function confirmClose() {
    if (!hasUnsavedChanges()) return true;
    return Boolean(
      confirmDiscard(
        "Tenés cambios sin guardar. Si cerrás ahora, se van a perder. ¿Querés descartarlos?",
      ),
    );
  }

  function handleBeforeUnload(event) {
    if (!hasUnsavedChanges()) return undefined;
    event.preventDefault();
    event.returnValue = "";
    return "";
  }

  markClean();

  return {
    markClean,
    hasUnsavedChanges,
    confirmClose,
    handleBeforeUnload,
  };
}
