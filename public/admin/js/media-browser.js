import { safeMediaUrl } from "./html-safety.js";

export function createMediaBrowser({
  api,
  mediaModalOverlay,
  mediaSearch,
  mediaList,
  insertButton,
  renderList,
  onInsert,
  onError = () => {},
  onSuccess = () => {},
} = {}) {
  if (!api || !mediaModalOverlay || !mediaSearch || !mediaList || !insertButton || typeof renderList !== "function" || typeof onInsert !== "function") {
    throw new TypeError("Faltan dependencias para inicializar el navegador de medios.");
  }

  let items = [];
  let selectedItem = null;
  let loadRequestId = 0;

  function render() {
    const filter = mediaSearch.value.trim().toLocaleLowerCase();
    const filtered = filter
      ? items.filter((item) => item.name.toLocaleLowerCase().includes(filter))
      : items;
    mediaList.innerHTML = renderList(filtered, items);
  }

  async function load() {
    const requestId = ++loadRequestId;
    try {
      const data = await api.get("/content?collection=media&page=1");
      if (requestId !== loadRequestId) return items;
      items = (data.entries || []).map((entry) => ({
        name: entry.fields?.title || entry.slug,
        url: entry.fields?.coverImage || "",
        alt: entry.fields?.coverAlt || "",
        slug: entry.slug,
      }));
      render();
    } catch (error) {
      if (requestId !== loadRequestId) return items;
      items = [];
      render();
      onError(error);
    }
    return items;
  }

  function open() {
    mediaModalOverlay.style.display = "flex";
    return load();
  }

  function close() {
    mediaModalOverlay.style.display = "none";
  }

  function selectItem(element, itemOrIndex) {
    const item = typeof itemOrIndex === "number" ? items[itemOrIndex] : itemOrIndex;
    if (!item) return false;
    const url = safeMediaUrl(item.url);
    if (!url) {
      onError(new Error("La imagen seleccionada no tiene una ruta válida."));
      return false;
    }

    mediaList.querySelectorAll(".media-item").forEach((node) => node.classList.remove("selected"));
    element?.classList.add("selected");
    selectedItem = {
      url,
      alt: String(item.alt ?? "").replace(/[\r\n]/g, " ").slice(0, 240),
    };
    insertButton.disabled = false;
    insertButton.textContent = selectedItem.alt
      ? `Insertar "${selectedItem.alt}" en el cuerpo`
      : "Insertar imagen en el cuerpo";
    return true;
  }

  function insertSelected() {
    if (!selectedItem) return false;
    const markdown = `![${selectedItem.alt}](${selectedItem.url})\n\n`;
    onInsert(markdown);
    close();
    onSuccess("Imagen insertada en el cuerpo");
    return true;
  }

  function addItem(item) {
    if (!item || !safeMediaUrl(item.url)) return false;
    items = [item, ...items.filter((existing) => existing.url !== item.url)];
    render();
    return true;
  }

  mediaSearch.addEventListener("input", render);
  mediaList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-media-index]");
    if (!target || !mediaList.contains(target)) return;
    selectItem(target, Number(target.dataset.mediaIndex));
  });
  insertButton.addEventListener("click", insertSelected);

  return {
    load,
    open,
    close,
    render,
    selectItem,
    insertSelected,
    addItem,
    getItems: () => [...items],
    getSelected: () => selectedItem ? { ...selectedItem } : null,
  };
}
