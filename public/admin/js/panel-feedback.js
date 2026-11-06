export function createPanelFeedback({
  errorElement,
  successElement,
  contentElement,
  hideDelay = 5000,
} = {}) {
  if (!errorElement || !successElement || !contentElement) {
    throw new TypeError("Faltan elementos para inicializar los estados del panel.");
  }

  let messageTimer = null;

  function clearMessages() {
    if (messageTimer !== null) clearTimeout(messageTimer);
    messageTimer = null;
    errorElement.textContent = "";
    successElement.textContent = "";
    errorElement.style.display = "none";
    successElement.style.display = "none";
  }

  function showMessage(element, message) {
    if (messageTimer !== null) clearTimeout(messageTimer);
    errorElement.style.display = element === errorElement ? "block" : "none";
    successElement.style.display = element === successElement ? "block" : "none";
    element.setAttribute("role", element === errorElement ? "alert" : "status");
    element.setAttribute("aria-live", element === errorElement ? "assertive" : "polite");
    element.textContent = String(message || "");
    messageTimer = setTimeout(clearMessages, hideDelay);
  }

  function setContentState(kind, message, { busy = false } = {}) {
    contentElement.dataset.state = kind;
    if (busy) contentElement.setAttribute("aria-busy", "true");
    else contentElement.removeAttribute("aria-busy");

    if (kind === "loading" || kind === "error") {
      const role = kind === "error" ? "alert" : "status";
      contentElement.innerHTML = `<div class="panel-state panel-state-${kind}" role="${role}">${escapeText(message)}</div>`;
    }
  }

  function beginSaving(form, button) {
    const controls = Array.from(form.elements);
    const previousDisabled = controls.map((control) => control.disabled);
    const previousLabel = button.textContent;
    controls.forEach((control) => { control.disabled = true; });
    button.textContent = "Guardando…";
    form.setAttribute("aria-busy", "true");
    return () => {
      controls.forEach((control, index) => { control.disabled = previousDisabled[index]; });
      button.textContent = previousLabel;
      form.removeAttribute("aria-busy");
    };
  }

  return {
    clearMessages,
    showError: (message) => showMessage(errorElement, message),
    showSuccess: (message) => showMessage(successElement, message),
    setContentState,
    beginSaving,
  };
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
