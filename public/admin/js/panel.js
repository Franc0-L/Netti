import { renderMarkdownPreview } from "./markdown-preview.js";
import { adminApi } from "./api-client.js";
import { renderCollectionList, renderTrashList } from "./list-views.js";
import { validateImageFile, uploadImageFile } from "./media-upload.js";
import { createEditorForm, slugifyTitle } from "./editor-form.js";
import { createEditorState } from "./editor-state.js";

const collectionLabels = {
  games: "Juegos",
  reviews: "Reseñas",
  news: "Noticias",
  guides: "Guías",
};

let isAuthenticated = false;
let editSha = "";
let currentCollection = null;
let currentPage = 1;
let currentImageFile = null;
let currentImageUrl = null;
let isSaving = false;

// Elementos DOM — barra superior
const topCollections = document.getElementById("top-collections");
const logoutBtn = document.getElementById("logout-btn");

// Elementos DOM — sidebar
const collectionList = document.getElementById("collection-list");
const trashLink = document.getElementById("trash-link");

// Elementos DOM — header del editor
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");
const previewBtn = document.getElementById("preview-btn");
const saveBtn = document.getElementById("save-btn");
const newBtn = document.getElementById("new-btn");

// Elementos DOM — formulario
const errorMsg = document.getElementById("error-msg");
const successMsg = document.getElementById("success-msg");
const editorForm = document.getElementById("editor-form");
const editId = document.getElementById("edit-id");
const editCollection = document.getElementById("edit-collection");
const editTitle = document.getElementById("edit-title");
const editSlug = document.getElementById("edit-slug");
const editDescription = document.getElementById("edit-description");
const editBody = document.getElementById("edit-body");
const editGame = document.getElementById("edit-game");
const editScore = document.getElementById("edit-score");
const editorFields = createEditorForm();

// Imagen
const imageInput = document.getElementById("image-input");
const imagePreview = document.getElementById("image-preview");
const imageAlt = document.getElementById("edit-cover-alt");

// Modal de vista previa
const previewModal = document.getElementById("preview-modal");
const previewBody = document.getElementById("preview-body");
const closePreviewBtn = document.getElementById("close-preview");

const editorState = createEditorState({
  form: editorForm,
  confirmDiscard: (message) => window.confirm(message),
});

window.addEventListener("beforeunload", editorState.handleBeforeUnload);

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
  successMsg.style.display = "none";
  setTimeout(() => { errorMsg.style.display = "none"; }, 6000);
}

function showSuccess(msg) {
  successMsg.textContent = msg;
  successMsg.style.display = "block";
  errorMsg.style.display = "none";
  setTimeout(() => { successMsg.style.display = "none"; }, 4000);
}

function clearMessages() {
  errorMsg.style.display = "none";
  successMsg.style.display = "none";
}

async function checkAuth() {
  try {
    await adminApi.get("/content?collection=games&page=1");
    isAuthenticated = true;
    renderTopNav();
    loadCollection("games");
  } catch (error) {
    isAuthenticated = false;
    showError("No se pudo verificar la sesión: " + (error.message || "volvé a iniciar sesión."));
  }
}

function renderTopNav() {
  topCollections.innerHTML = "";
  for (const [key, label] of Object.entries(collectionLabels)) {
    const a = document.createElement("a");
    a.href = "#";
    a.dataset.collection = key;
    a.textContent = label;
    a.className = currentCollection === key ? "active" : "";
    a.addEventListener("click", (event) => {
      event.preventDefault();
      loadCollection(key);
    });
    topCollections.appendChild(a);
  }
}

function setActiveLink(collection) {
  topCollections.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("active", link.dataset.collection === collection);
  });
}

async function loadCollection(collection, page = 1) {
  if (!Object.hasOwn(collectionLabels, collection)) return;
  currentCollection = collection;
  currentPage = page;
  pageTitle.textContent = collectionLabels[collection];
  pageSubtitle.textContent = `Gestioná las publicaciones de ${collectionLabels[collection].toLocaleLowerCase()}.`;
  setActiveLink(collection);

  collectionList.innerHTML = '<div class="empty-state"><p>Cargando publicaciones…</p></div>';

  try {
    const params = new URLSearchParams({ collection, page: String(page) });
    const data = await adminApi.get(`/content?${params.toString()}`);
    currentPage = data.page || page;
    collectionList.innerHTML = renderCollectionList({
      entries: data.entries || [],
      page: data.page || page,
      pageCount: data.pageCount || 0,
      query: "",
      isSearching: false,
    });
    bindListActions();
  } catch (error) {
    showError(error.message || "No se pudieron cargar las publicaciones.");
  }
}

async function loadTrash() {
  currentCollection = null;
  pageTitle.textContent = "Papelera";
  pageSubtitle.textContent = "Publicaciones eliminadas que podés recuperar.";
  setActiveLink(null);

  collectionList.innerHTML = '<div class="empty-state"><p>Cargando papelera…</p></div>';

  try {
    const data = await adminApi.get("/content?collection=trash");
    collectionList.innerHTML = renderTrashList(data.entries || []);
    bindListActions();
  } catch (error) {
    showError(error.message || "No se pudo cargar la papelera.");
  }
}

function bindListActions() {
  collectionList.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const action = btn.dataset.action;
      const slug = btn.dataset.slug;
      const collection = btn.dataset.collection;
      const sha = btn.dataset.sha;
      if (action === "edit") editArticle(slug, collection, sha);
      else if (action === "delete") deleteArticle(slug, collection, sha);
      else if (action === "recover") recoverArticle(slug, collection, sha);
    });
  });
  collectionList.querySelectorAll("a[data-page]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (currentCollection) loadCollection(currentCollection, Number(link.dataset.page));
    });
  });
}

async function recoverArticle(slug, collection, sha) {
  if (!confirm(`¿Recuperar "${slug}"?`)) return;
  try {
    await adminApi.post("/content", { action: "restore", collection, slug, sha });
    showSuccess("Publicación recuperada correctamente.");
    loadTrash();
  } catch (err) {
    showError(err.message || "No se pudo recuperar la publicación.");
  }
}

async function deleteArticle(slug, collection, sha) {
  if (!confirm(`¿Estás seguro de que querés borrar "${slug}"?`)) return;
  try {
    await adminApi.delete("/content", { collection, slug, sha });
    showSuccess("Artículo borrado correctamente");
    if (currentCollection) loadCollection(currentCollection, currentPage);
    else loadTrash();
  } catch (err) {
    showError(err.message || "No se pudo borrar el artículo");
  }
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
    editGame.value = entry.fields.game || "";
    editScore.value = entry.fields.score || "";
    editorFields.populateMetadataFields(entry.fields);
    editorFields.setMetadataVisibility(entry.collection);

    currentImageFile = null;
    currentImageUrl = null;
    imageInput.value = "";
    imagePreview.innerHTML = "";
    imageAlt.value = entry.fields.coverAlt || "";
    currentImageUrl = entry.fields.coverImage || null;
    if (currentImageUrl) {
      const img = document.createElement("img");
      img.src = currentImageUrl;
      img.alt = "Vista previa";
      imagePreview.innerHTML = "";
      imagePreview.appendChild(img);
    }

    editorState.markClean();
    editTitle.focus();
    showSuccess(`Editando: ${entry.fields.title || entry.slug}`);
  } catch (err) {
    showError(err.message || "No se pudo cargar el artículo");
  }
}

function createArticle() {
  editId.value = "";
  editSha = "";
  editCollection.value = currentCollection || "games";
  editTitle.value = "";
  editSlug.value = "";
  editDescription.value = "";
  editBody.value = "";
  editGame.value = "";
  editScore.value = "";
  editorFields.resetMetadataFields();
  editorFields.setMetadataVisibility(currentCollection || "games");

  currentImageFile = null;
  currentImageUrl = null;
  imageInput.value = "";
  imagePreview.innerHTML = "";
  imageAlt.value = "";

  editorState.markClean();
  editTitle.focus();
  clearMessages();
  showSuccess("Nuevo artículo — completá los campos y guardá.");
}

async function saveArticle() {
  if (isSaving) return;
  clearMessages();

  isSaving = true;
  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando…";

  try {
    const collection = editCollection.value;
    const slug = editSlug.value.trim();

    const fields = editorFields.buildPayload({
      collection,
      slug,
      title: editTitle.value,
      description: editDescription.value,
      body: editBody.value,
      game: editGame.value,
      score: editScore.value,
      coverAlt: imageAlt.value,
    });

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

    await adminApi.request("/content", { method, body });

    showSuccess(isEdit ? "Artículo guardado" : "Artículo creado");
    editorState.markClean();
    if (currentCollection) loadCollection(currentCollection, currentPage);
  } catch (err) {
    showError(err.message || "No se pudo guardar el artículo");
  } finally {
    isSaving = false;
    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar";
  }
}

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveArticle();
});

newBtn.addEventListener("click", createArticle);

previewBtn.addEventListener("click", () => {
  const markdown = editBody.value.trim();
  if (!markdown) {
    showError("Escribí algo en el cuerpo antes de previsualizar.");
    return;
  }
  previewBody.innerHTML = renderMarkdownPreview(markdown);
  previewModal.classList.remove("hidden");
});

closePreviewBtn.addEventListener("click", () => {
  previewModal.classList.add("hidden");
});

previewModal.addEventListener("click", (event) => {
  if (event.target === previewModal) previewModal.classList.add("hidden");
});

logoutBtn.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    await adminApi.post("/login", { action: "logout" });
  } finally {
    window.location.href = "/admin/";
  }
});

trashLink.addEventListener("click", (event) => {
  event.preventDefault();
  loadTrash();
});

// Slug automático desde título
editTitle.addEventListener("input", () => {
  if (!editSlug.value) editSlug.value = slugifyTitle(editTitle.value);
});

// Imagen de portada
imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const validationError = validateImageFile(file);
  if (validationError) {
    currentImageFile = null;
    imageInput.value = "";
    imagePreview.innerHTML = "";
    showError(validationError);
    return;
  }
  currentImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.innerHTML = "";
    const img = document.createElement("img");
    img.src = e.target.result;
    img.alt = "Vista previa";
    imagePreview.appendChild(img);
  };
  reader.readAsDataURL(file);
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
    imagePreview.innerHTML = "";
    const img = document.createElement("img");
    img.src = data.url;
    img.alt = "Vista previa";
    imagePreview.appendChild(img);
    showSuccess("Imagen subida correctamente");
    return data.url;
  } catch (err) {
    showError(err.message || "No se pudo subir la imagen");
    return null;
  }
}

// Inicializar
checkAuth();

window.app = {
  loadCollection,
  loadPage: (page) => { if (currentCollection) loadCollection(currentCollection, page); },
  editArticle,
  deleteArticle,
  loadTrash,
  recoverArticle,
};
