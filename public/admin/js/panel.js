import { renderMarkdownPreview } from "./markdown-preview.js";
import { adminApi } from "./api-client.js";
import { renderCollectionList, renderTrashList, renderMediaList as renderMediaListHtml } from "./list-views.js";
import { safeMediaUrl } from "./html-safety.js";
import { validateImageFile, uploadImageFile } from "./media-upload.js";
import { createEditorForm, slugifyTitle } from "./editor-form.js";

const collectionLabels = {
  games: "Juegos",
  reviews: "Reseñas",
  news: "Noticias",
  guides: "Guías",
};



let currentCollection = null;
let currentPage = 1;
let isAuthenticated = false;
let editSha = "";

// Elementos DOM
const sidebarLinks = document.querySelectorAll(".nav-link");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");
const contentArea = document.getElementById("content-area");
const errorMsg = document.getElementById("error-msg");
const successMsg = document.getElementById("success-msg");
const newBtn = document.getElementById("new-btn");
const previewBtn = document.getElementById("preview-btn");
const panelSearch = document.getElementById("panel-search");
const clearSearchBtn = document.getElementById("clear-search");

let collectionRequestId = 0;
let searchDebounce = null;

// Modal
const modalOverlay = document.getElementById("modal-overlay");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const editorForm = document.getElementById("editor-form");
const closeModal = document.getElementById("close-modal");
const cancelBtn = document.getElementById("cancel-btn");

// Campos del formulario
const editId = document.getElementById("edit-id");
const editCollection = document.getElementById("edit-collection");
const editTitle = document.getElementById("edit-title");
const editSlug = document.getElementById("edit-slug");
const editDescription = document.getElementById("edit-description");
const editBody = document.getElementById("edit-body");
const editPreview = document.getElementById("edit-preview");
const editGame = document.getElementById("edit-game");
const editScore = document.getElementById("edit-score");
const editorFields = createEditorForm();
const gameRefGroup = document.getElementById("game-ref-group");
const scoreGroup = document.getElementById("score-group");


// Subida de imagen
const imageInput = document.getElementById("image-input");
const imagePreview = document.getElementById("image-preview");
const imagePreviewImg = document.getElementById("image-preview-img");
const imageAlt = document.getElementById("image-alt");
const removeImageBtn = document.getElementById("remove-image");
const insertImageBtn = document.getElementById("insert-image-btn");

// Navegador de medios
const mediaModalOverlay = document.getElementById("media-modal-overlay");
const mediaModal = document.getElementById("media-modal");
const closeMediaModal = document.getElementById("close-media-modal");
const closeMediaModalBtn = document.getElementById("close-media-modal-btn");
const mediaSearch = document.getElementById("media-search");
const mediaList = document.getElementById("media-list");
const mediaBrowserLink = document.getElementById("media-browser-link");

let currentImageFile = null;
let currentImageUrl = null;
let selectedMediaItem = null;
let mediaItems = [];

async function checkAuth() {
  try {
    await adminApi.get("/content?collection=games&page=1");
    isAuthenticated = true;
    if (!isAuthenticated) {
      window.location.href = "/admin/";
    }
  } catch {
    window.location.href = "/admin/";
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
  successMsg.style.display = "none";
  setTimeout(() => {
    errorMsg.style.display = "none";
  }, 5000);
}

function showSuccess(msg) {
  successMsg.textContent = msg;
  successMsg.style.display = "block";
  errorMsg.style.display = "none";
  setTimeout(() => {
    successMsg.style.display = "none";
  }, 5000);
}

function setActiveLink(collection) {
  sidebarLinks.forEach((link) => {
    const col = link.dataset.collection;
    link.classList.toggle("active", col === collection);
  });
}

function updatePreview() {
  const markdown = editBody.value;
  editPreview.innerHTML = renderMarkdownPreview(markdown);
}

async function loadCollection(collection, page = 1) {
  currentCollection = collection;
  currentPage = page;

  pageTitle.textContent = collectionLabels[collection];
  pageSubtitle.textContent = `Gestioná los artículos de la colección "${collection}".`;
  setActiveLink(collection);

  const requestId = ++collectionRequestId;
  const query = panelSearch.value.trim();
  contentArea.setAttribute("aria-busy", "true");
  try {
    const params = new URLSearchParams({ collection, page: String(page) });
    if (query) params.set("q", query);
    const data = await adminApi.get(`/content?${params.toString()}`);
    if (requestId !== collectionRequestId) return;
    currentPage = data.page;
    renderList(data.entries || [], data.page, data.pageCount, data.total, Boolean(query));
  } catch (err) {
    if (requestId !== collectionRequestId) return;
    showError(err.message || "Error al cargar la colección");
    contentArea.innerHTML = `<div class="empty">Error al cargar los artículos.</div>`;
  } finally {
    if (requestId === collectionRequestId) contentArea.removeAttribute("aria-busy");
  }
}

function renderList(entries, page, pageCount, total, isSearching = false) {
  contentArea.innerHTML = renderCollectionList({
    entries,
    page,
    pageCount,
    query: panelSearch.value.trim(),
    isSearching,
  });
}


async function createArticle() {
  editId.value = "";
  editSha = "";
  editCollection.value = currentCollection;
  editTitle.value = "";
  editSlug.value = "";
  editDescription.value = "";
  editBody.value = "";
  editPreview.innerHTML = "";
  editGame.value = "";
  editScore.value = "";
  editorFields.resetMetadataFields();
  editorFields.setMetadataVisibility(currentCollection);

  currentImageFile = null;
  currentImageUrl = null;
  imageInput.value = "";
  imagePreview.style.display = "none";
  imageAlt.value = "";

  gameRefGroup.style.display = "none";
  scoreGroup.style.display = "none";

  if (currentCollection === "reviews" || currentCollection === "guides") {
    gameRefGroup.style.display = "block";
  }
  if (currentCollection === "reviews") {
    scoreGroup.style.display = "block";
  }

  modalTitle.textContent = `Nuevo ${collectionLabels[currentCollection]}`;
  modalOverlay.style.display = "flex";
  editTitle.focus();
  previewBtn.disabled = true;
}

async function editArticle(slug, collection, sha) {
  try {
    const data = await adminApi.get(`/content?collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`);
    const entry = data.entry;

    editId.value = entry.slug;
    editSha = entry.sha || "";
    editCollection.value = entry.collection;
    editTitle.value = entry.fields.title || "";
    editSlug.value = entry.slug;
    editDescription.value = entry.fields.description || "";
    editBody.value = entry.body || "";
    editPreview.innerHTML = renderMarkdownPreview(entry.body || "");
    editGame.value = entry.fields.game || "";
    editScore.value = entry.fields.score || "";
    editorFields.populateMetadataFields(entry.fields);
    editorFields.setMetadataVisibility(collection);

    currentImageFile = null;
    currentImageUrl = null;
    imageInput.value = "";
    imagePreview.style.display = "none";
    imageAlt.value = entry.fields.coverAlt || "";
    currentImageUrl = entry.fields.coverImage || null;
    if (currentImageUrl) { imagePreviewImg.src = currentImageUrl; imagePreview.style.display = "block"; }

    gameRefGroup.style.display =
      entry.collection === "reviews" || entry.collection === "guides"
        ? "block"
        : "none";
    scoreGroup.style.display =
      entry.collection === "reviews" ? "block" : "none";

    modalTitle.textContent = `Editar ${collectionLabels[collection]}`;
    modalOverlay.style.display = "flex";
    editTitle.focus();
    previewBtn.disabled = false;
  } catch (err) {
    showError(err.message || "No se pudo cargar el artículo");
  }
}

async function deleteArticle(slug, collection, sha) {
  if (!confirm(`¿Estás seguro de que querés borrar "${slug}"?`)) return;

  try {
    await adminApi.delete("/content", { collection, slug, sha });
    showSuccess("Artículo borrado correctamente");
    loadCollection(collection, currentPage);
  } catch (err) {
    showError(err.message || "No se pudo borrar el artículo");
  }
}

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const collection = editCollection.value;
  const slug = editSlug.value.trim();
  const articlePayload = editorFields.buildPayload({
    collection,
    slug,
    title: editTitle.value,
    description: editDescription.value,
    body: editBody.value,
    game: editGame.value,
    score: editScore.value,
    coverAlt: imageAlt.value,
  });
  const fields = articlePayload.fields;

  const isEdit = !!editId.value;
  const method = isEdit ? "PUT" : "POST";
  const body = {
    collection,
    slug,
    fields,
    body: editBody.value.trim(),
  };
  if (currentImageFile) {
    const uploaded = await uploadImage(collection, slug);
    if (!uploaded) return;
    fields.coverImage = uploaded;
  } else if (currentImageUrl) {
    fields.coverImage = currentImageUrl;
  }
  if (isEdit) body.sha = editSha;

  try {
    await adminApi.request("/content", { method, body });

    showSuccess(isEdit ? "Artículo guardado" : "Artículo creado");
    modalOverlay.style.display = "none";
    loadCollection(collection, currentPage);
  } catch (err) {
    showError(err.message || "No se pudo guardar el artículo");
  }
});

newBtn.addEventListener("click", createArticle);
closeModal.addEventListener("click", () => {
  modalOverlay.style.display = "none";
});
cancelBtn.addEventListener("click", () => {
  modalOverlay.style.display = "none";
});
modalOverlay.addEventListener("click", (event) => {
  if (event.target === modalOverlay) modalOverlay.style.display = "none";
});

document
  .getElementById("logout-link")
  .addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await adminApi.post("/login", { action: "logout" });
    } finally {
      window.location.href = "/admin/";
    }
  });

document.getElementById("trash-link").addEventListener("click", (event) => {
  event.preventDefault();
  setActiveLink(null);
  pageTitle.textContent = "Papelera";
  pageSubtitle.textContent = "Artículos eliminados que se pueden recuperar.";
  loadTrash();
});

panelSearch.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (currentCollection) loadCollection(currentCollection, 1);
  }, 300);
});

clearSearchBtn.addEventListener("click", () => {
  panelSearch.value = "";
  clearTimeout(searchDebounce);
  if (currentCollection) loadCollection(currentCollection, 1);
});

// Navegador de medios
mediaBrowserLink.addEventListener("click", (event) => {
  event.preventDefault();
  setActiveLink(null);
  pageTitle.textContent = "Navegador de medios";
  pageSubtitle.textContent = "Selecciona una imagen para insertar en el artículo.";
  mediaModalOverlay.style.display = "flex";
  loadMedia();
});

closeMediaModal.addEventListener("click", () => {
  mediaModalOverlay.style.display = "none";
});
closeMediaModalBtn.addEventListener("click", () => {
  mediaModalOverlay.style.display = "none";
});
mediaModalOverlay.addEventListener("click", (event) => {
  if (event.target === mediaModalOverlay) mediaModalOverlay.style.display = "none";
});

mediaSearch.addEventListener("input", () => {
  const filter = mediaSearch.value.toLowerCase();
  const filtered = mediaItems.filter((item) =>
    item.name.toLowerCase().includes(filter)
  );
  renderMediaList(filtered);
});

// Slug automático desde título
editTitle.addEventListener("input", () => {
  if (!editSlug.value) editSlug.value = slugifyTitle(editTitle.value);
});

// Preview en tiempo real
editBody.addEventListener("input", updatePreview);

// --- Papelera ---
async function loadTrash() {
  try {
    const data = await adminApi.get("/content?collection=trash");

    contentArea.innerHTML = renderTrashList(data.entries || []);
  } catch (err) {
    showError(err.message || "No se pudo cargar la papelera");
    contentArea.innerHTML = `<div class="empty">Error al cargar la papelera.</div>`;
  }
}

async function recoverArticle(slug, collection, sha) {
  if (!confirm(`¿Recuperar "${slug}"?`)) return;
  try {
    await adminApi.post("/content", { action: "restore", collection, slug, sha });
    showSuccess("Artículo recuperado");
    loadTrash();
  } catch (err) {
    showError(err.message || "No se pudo recuperar el artículo");
  }
}

// --- Navegador de medios ---
async function loadMedia() {
  try {
    const data = await adminApi.get("/content?collection=media&page=1");
    mediaItems = (data.entries || []).map((entry) => ({
      name: entry.fields.title || entry.slug,
      url: entry.fields.coverImage || "",
      alt: entry.fields.coverAlt || "",
      slug: entry.slug,
    }));
    renderMediaList(mediaItems);
  } catch {
    mediaItems = [];
    renderMediaList([]);
  }
}

function renderMediaList(items) {
  mediaList.innerHTML = renderMediaListHtml(items, mediaItems);
}

function selectMediaItem(element, url, alt) {
  const safeUrl = safeMediaUrl(url);
  if (!safeUrl) {
    showError("La imagen seleccionada no tiene una ruta válida.");
    return;
  }
  document.querySelectorAll(".media-item").forEach((el) =>
    el.classList.remove("selected")
  );
  element.classList.add("selected");
  selectedMediaItem = {
    url: safeUrl,
    alt: String(alt ?? "").replace(/[\\r\\n]/g, " ").slice(0, 240),
  };
  insertImageBtn.disabled = false;
  insertImageBtn.textContent = `Insertar "${selectedMediaItem.alt}" en el cuerpo`;
}

function insertSelectedMediaIntoBody() {
  if (!selectedMediaItem) return;
  const { url, alt } = selectedMediaItem;
  const markdownImage = `![${alt}](${url})\n\n`;
  insertTextAtCursor(markdownImage);
  updatePreview();
  mediaModalOverlay.style.display = "none";
  showSuccess("Imagen insertada en el cuerpo");
}

function insertMarkdown(openTag, closeTag) {
  const text = `${openTag}${closeTag}`;
  insertTextAtCursor(text);
  editBody.focus();
}

function insertTextAtCursor(text) {
  const textarea = editBody;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  textarea.value = before + text + after;
  textarea.selectionStart = start + text.length;
  textarea.selectionEnd = start + text.length;
  textarea.focus();
  updatePreview();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], [data-page], [data-media-index], [data-markdown-open]");
  if (!target) return;
  if (target.dataset.markdownOpen !== undefined) {
    insertMarkdown(target.dataset.markdownOpen, target.dataset.markdownClose || "");
    return;
  }
  if (target.dataset.page) {
    loadCollection(currentCollection, Number(target.dataset.page));
    return;
  }
  if (target.dataset.mediaIndex !== undefined) {
    const item = mediaItems[Number(target.dataset.mediaIndex)];
    if (item) selectMediaItem(target, item.url, item.alt);
    return;
  }
  const { action, slug, collection, sha } = target.dataset;
  if (action === "edit") editArticle(slug, collection, sha);
  else if (action === "delete") deleteArticle(slug, collection, sha);
  else if (action === "recover") recoverArticle(slug, collection, sha);
});

// API pública del panel
window.app = {
  loadCollection,
  loadPage: (page) => loadCollection(currentCollection, page),
  editArticle,
  deleteArticle,
  loadTrash,
  recoverArticle,
  selectMediaItem,
  insertSelectedMediaIntoBody,
  insertMarkdown,
};

// Inicializar
checkAuth().then(() => {
  const firstLink = sidebarLinks[0];
  if (firstLink) {
    const collection = firstLink.dataset.collection;
    loadCollection(collection);
  }
  loadMedia();
});

// --- Manejo de imagen ---
imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const validationError = validateImageFile(file);
  if (validationError) {
    currentImageFile = null;
    imageInput.value = "";
    if (currentImageUrl) {
      imagePreviewImg.src = currentImageUrl;
      imagePreview.style.display = "block";
    } else {
      imagePreview.style.display = "none";
    }
    showError(validationError);
    return;
  }
  currentImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreviewImg.src = e.target.result;
    imagePreview.style.display = "block";
    if (!imageAlt.value) {
      imageAlt.value = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ");
    }
  };
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener("click", () => {
  currentImageFile = null;
  currentImageUrl = null;
  imageInput.value = "";
  imagePreview.style.display = "none";
  imageAlt.value = "";
});

insertImageBtn.addEventListener("click", () => {
  insertSelectedMediaIntoBody();
});

previewBtn.addEventListener("click", () => {
  const collection = editCollection.value;
  const slug = editSlug.value.trim();
  if (!slug) return;
  const pathMap = {
    games: "/juegos/",
    reviews: "/resenas/",
    news: "/noticias/",
    guides: "/guias/",
  };
  const path = pathMap[collection] || "/";
  window.open(`${path}${slug}/`, "_blank");
});

async function uploadImage(collection, slug) {
  if (!currentImageFile) return currentImageUrl;
  try {
    const file = currentImageFile;
    const data = await uploadImageFile({
      api: adminApi,
      file,
      collection,
      slug,
      alt: imageAlt.value || file.name,
    });
    currentImageFile = null;
    currentImageUrl = data.url;
    imageInput.value = "";
    imagePreviewImg.src = data.url;
    imagePreview.style.display = "block";
    mediaItems.unshift({
      name: file.name,
      url: data.url,
      alt: data.alt || imageAlt.value,
      slug,
    });
    renderMediaList(mediaItems);
    showSuccess("Imagen subida correctamente");
    return data.url;
  } catch (err) {
    showError(err.message || "No se pudo subir la imagen");
    return null;
  }
}