export function createContentNavigation({
  api,
  contentArea,
  pageTitle,
  pageSubtitle,
  sidebarLinks,
  searchInput,
  renderCollectionList,
  renderTrashList,
  feedback,
  collectionLabels,
} = {}) {
  if (!api || !contentArea || !pageTitle || !pageSubtitle || !sidebarLinks || !searchInput ||
      typeof renderCollectionList !== "function" || typeof renderTrashList !== "function" ||
      !feedback || !collectionLabels) {
    throw new TypeError("Faltan dependencias para inicializar la navegación editorial.");
  }

  let currentCollection = null;
  let currentPage = 1;
  let activeView = "collection";
  let requestId = 0;

  function setActiveLink(collection) {
    sidebarLinks.forEach((link) => {
      const key = link.dataset.collection;
      const isTrash = link.id === "trash-link";
      link.classList.toggle("active", collection ? key === collection : isTrash);
    });
  }

  async function loadCollection(collection, page = 1) {
    if (!Object.hasOwn(collectionLabels, collection)) {
      feedback.showError("La colección seleccionada no es válida.");
      return;
    }

    activeView = "collection";
    currentCollection = collection;
    currentPage = page;
    const title = collectionLabels[collection];
    pageTitle.textContent = title;
    pageSubtitle.textContent = `Gestioná las publicaciones de ${title.toLocaleLowerCase()}.`;
    setActiveLink(collection);

    const id = ++requestId;
    const query = searchInput.value.trim();
    feedback.setContentState("loading", "Cargando publicaciones…", { busy: true });
    try {
      const params = new URLSearchParams({ collection, page: String(page) });
      if (query) params.set("q", query);
      const data = await api.get(`/content?${params.toString()}`);
      if (id !== requestId) return;
      currentPage = data.page || page;
      contentArea.innerHTML = renderCollectionList({
        entries: data.entries || [],
        page: data.page || page,
        pageCount: data.pageCount || 0,
        query,
        isSearching: Boolean(query),
      });
      feedback.setContentState("ready", "");
    } catch (error) {
      if (id !== requestId) return;
      feedback.showError(error.message || "No se pudieron cargar las publicaciones.");
      feedback.setContentState("error", "No se pudieron cargar las publicaciones. Revisá tu conexión e intentá nuevamente.");
    }
  }

  async function loadTrash() {
    activeView = "trash";
    setActiveLink(null);
    pageTitle.textContent = "Papelera";
    pageSubtitle.textContent = "Publicaciones eliminadas que podés recuperar.";
    const id = ++requestId;
    feedback.setContentState("loading", "Cargando papelera…", { busy: true });
    try {
      const data = await api.get("/content?collection=trash");
      if (id !== requestId) return;
      contentArea.innerHTML = renderTrashList(data.entries || []);
      feedback.setContentState("ready", "");
    } catch (error) {
      if (id !== requestId) return;
      feedback.showError(error.message || "No se pudo cargar la papelera.");
      feedback.setContentState("error", "No se pudo cargar la papelera. Intentá nuevamente.");
    }
  }

  return {
    loadCollection,
    loadTrash,
    loadPage: (page) => currentCollection ? loadCollection(currentCollection, page) : Promise.resolve(),
    refresh: () => activeView === "trash" ? loadTrash() : currentCollection ? loadCollection(currentCollection, currentPage) : Promise.resolve(),
    getState: () => ({ collection: currentCollection, page: currentPage, view: activeView }),
    invalidate: () => { requestId += 1; },
  };
}

export function createTrashController({
  api,
  confirmRestore = () => true,
  feedback,
  reloadTrash,
} = {}) {
  if (!api || !feedback || typeof reloadTrash !== "function") {
    throw new TypeError("Faltan dependencias para inicializar la papelera.");
  }

  async function recoverArticle(slug, collection, sha) {
    if (!confirmRestore(`¿Recuperar "${slug}"?`)) return false;
    try {
      await api.post("/content", { action: "restore", collection, slug, sha });
      feedback.showSuccess("Publicación recuperada correctamente.");
      await reloadTrash();
      return true;
    } catch (error) {
      feedback.showError(error.message || "No se pudo recuperar la publicación.");
      return false;
    }
  }

  return { recoverArticle };
}
