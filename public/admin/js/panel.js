import { renderMarkdownPreview } from "./markdown-preview.js";
import { escapeHtml, escapeAttribute, safeMediaUrl } from "./html-safety.js";

const API_BASE = "/api/admin";

const collectionLabels = {
  games: "Juegos",
  reviews: "Reseñas",
  news: "Noticias",
  guides: "Guías",
};

const collectionBadges = {
  games: "badge-games",
  reviews: "badge-reviews",
  news: "badge-news",
  guides: "badge-guides",
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
const editTags = document.getElementById("edit-tags");
const gameRefGroup = document.getElementById("game-ref-group");
const scoreGroup = document.getElementById("score-group");
const metadataFields = {
  releaseYear: document.getElementById("field-release-year"),
  platforms: document.getElementById("field-platforms"),
  genres: document.getElementById("field-genres"),
  developer: document.getElementById("field-developer"),
  publisher: document.getElementById("field-publisher"),
  publishedAt: document.getElementById("field-published-at"),
  author: document.getElementById("field-author"),
  category: document.getElementById("field-category"),
  sourceName: document.getElementById("field-source-name"),
  sourceUrl: document.getElementById("field-source-url"),
  scoreReason: document.getElementById("field-score-reason"),
  verdict: document.getElementById("field-verdict"),
  featured: document.getElementById("field-featured"),
};

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
    const res = await fetch(`${API_BASE}/content?collection=games&page=1`);
    isAuthenticated = res.ok;
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
    const res = await fetch(`${API_BASE}/content?${params.toString()}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo cargar la colección");
    }
    const data = await res.json();
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
  if (!entries || entries.length === 0) {
    contentArea.innerHTML = isSearching
      ? `<div class="empty">No encontramos publicaciones que coincidan con “${escapeHtml(panelSearch.value.trim())}”. Probá con otro título o nombre.</div>`
      : `
      <div class="empty">
        Todavía no hay artículos en esta colección.<br>
        Hacé clic en "Nuevo artículo" para crear uno.
      </div>
    `;
    return;
  }

  const rows = entries
    .map((entry) => {
      const badgeClass = collectionBadges[entry.collection] || "";
      const title = escapeHtml(entry.fields?.title || entry.slug);
      const slug = entry.slug;
      const slugText = escapeHtml(slug);
      const slugAttr = escapeAttribute(slug);
      const updated = escapeHtml(entry.fields?.updatedAt || entry.fields?.publishedAt || "");
      return `
      <tr>
        <td><span class="badge ${badgeClass}">${escapeHtml(entry.collection)}</span></td>
        <td>${title}</td>
        <td><code style="color:#b6adc9;">${slugText}</code></td>
        <td>${updated}</td>
        <td>
          <button class="btn-secondary" data-action="edit" data-slug="${slugAttr}" data-collection="${escapeAttribute(entry.collection)}" data-sha="${escapeAttribute(entry.sha || "")}">Editar</button>
          <button class="btn-danger" data-action="delete" data-slug="${slug}" data-collection="${entry.collection}" data-sha="${entry.sha || ""}">Borrar</button>
        </td>
      </tr>
    `;
    })
    .join("");

  const pagination =
    pageCount > 1
      ? `
      <div class="pagination">
        ${page > 1 ? `<a data-page="${page - 1}">← Anterior</a>` : `<span class="disabled">← Anterior</span>`}
        <span class="current">Página ${page} de ${pageCount}</span>
        ${page < pageCount ? `<a data-page="${page + 1}">Siguiente →</a>` : `<span class="disabled">Siguiente →</span>`}
      </div>
    `
      : "";

  contentArea.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Colección</th>
          <th>Título</th>
          <th>Slug</th>
          <th>Actualizado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${pagination}
  `;
}

function resetMetadataFields() {
  Object.entries(metadataFields).forEach(([key, input]) => {
    if (!input) return;
    if (key === "featured") input.checked = false;
    else input.value = "";
  });
  Array.from(editTags.options).forEach((option) => { option.selected = false; });
}

function populateMetadataFields(fields = {}) {
  Object.entries(metadataFields).forEach(([key, input]) => {
    if (!input) return;
    if (key === "featured") input.checked = Boolean(fields[key]);
    else if (key === "platforms" || key === "genres") input.value = Array.isArray(fields[key]) ? fields[key].join(", ") : "";
    else input.value = fields[key] ? String(fields[key]).slice(0, key === "publishedAt" ? 10 : undefined) : "";
  });
  const selected = new Set(Array.isArray(fields.tags) ? fields.tags : []);
  Array.from(editTags.options).forEach((option) => { option.selected = selected.has(option.value); });
}

function setMetadataVisibility(collection) {
  document.querySelectorAll("[data-collections]").forEach((group) => {
    group.hidden = !group.dataset.collections.split(",").includes(collection);
  });
  if (metadataFields.author && !metadataFields.author.value) {
    metadataFields.author.value = collection === "news" ? "Netti" : "Redacción";
  }
  if (metadataFields.category && !metadataFields.category.value) metadataFields.category.value = "Noticias";
}

function collectMetadataFields(collection) {
  const value = (key) => metadataFields[key]?.value?.trim() || "";
  const fields = {};
  if (collection === "games") {
    if (value("releaseYear")) fields.releaseYear = Number(value("releaseYear"));
    fields.platforms = value("platforms").split(",").map((v) => v.trim()).filter(Boolean);
    fields.genres = value("genres").split(",").map((v) => v.trim()).filter(Boolean);
    fields.developer = value("developer");
    if (value("publisher")) fields.publisher = value("publisher");
  }
  if (["reviews", "news", "guides"].includes(collection)) {
    fields.publishedAt = value("publishedAt");
    if (value("author")) fields.author = value("author");
  }
  if (collection === "news") {
    fields.category = value("category") || "Noticias";
    if (value("sourceName")) fields.sourceName = value("sourceName");
    if (value("sourceUrl")) fields.sourceUrl = value("sourceUrl");
  }
  if (collection === "reviews") {
    fields.scoreReason = value("scoreReason");
    fields.verdict = value("verdict");
  }
  if (metadataFields.featured?.checked) fields.featured = true;
  return fields;
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
  resetMetadataFields();
  setMetadataVisibility(currentCollection);

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
    const res = await fetch(
      `${API_BASE}/content?collection=${collection}&slug=${slug}`,
    );
    if (!res.ok) throw new Error("No se pudo cargar el artículo");
    const data = await res.json();
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
    populateMetadataFields(entry.fields);
    setMetadataVisibility(collection);

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
    const res = await fetch(`${API_BASE}/content`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, slug, sha }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "No se pudo borrar el artículo");
    }
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
  const fields = {
    title: editTitle.value.trim(),
    description: editDescription.value.trim(),
    tags: Array.from(editTags.selectedOptions).map((option) => option.value),
    coverAlt: imageAlt.value.trim(),
    ...collectMetadataFields(collection),
  };

  if (collection === "reviews" || collection === "guides") {
    if (editGame.value.trim()) fields.game = editGame.value.trim();
  }
  if (collection === "reviews") {
    if (editScore.value) fields.score = parseInt(editScore.value, 10);
  }

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
    const res = await fetch(`${API_BASE}/content`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "No se pudo guardar el artículo");
    }

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
      await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
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
  if (!editSlug.value) {
    editSlug.value = editTitle.value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
});

// Preview en tiempo real
editBody.addEventListener("input", updatePreview);

// --- Papelera ---
async function loadTrash() {
  try {
    const res = await fetch(`${API_BASE}/content?collection=trash`);
    if (!res.ok) throw new Error("No se pudo cargar la papelera");
    const data = await res.json();

    if (!data.entries || data.entries.length === 0) {
      contentArea.innerHTML = `<div class="empty">La papelera está vacía.</div>`;
      return;
    }

    const rows = data.entries
      .map((entry) => {
        const title = escapeHtml(entry.fields.title || entry.slug);
        const slug = entry.slug;
        const slugText = escapeHtml(slug);
        const slugAttr = escapeAttribute(slug);
        const deletedAt = escapeHtml(entry.fields.deletedAt || "");
        const deletedCollection = escapeAttribute(entry.collection || "games");
        return `
        <tr>
          <td><span class="badge badge-games">${escapeHtml(deletedCollection)}</span></td>
          <td>${title}</td>
          <td><code style="color: var(--muted);">${slugText}</code></td>
          <td>${deletedAt}</td>
          <td>
            <button class="btn-secondary" data-action="recover" data-slug="${slugAttr}" data-collection="${deletedCollection}">Recuperar</button>
          </td>
        </tr>
      `;
      })
      .join("");

    contentArea.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Colección</th>
            <th>Título</th>
            <th>Slug</th>
            <th>Eliminado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    showError(err.message || "No se pudo cargar la papelera");
    contentArea.innerHTML = `<div class="empty">Error al cargar la papelera.</div>`;
  }
}

async function recoverArticle(slug, collection, sha) {
  if (!confirm(`¿Recuperar "${slug}"?`)) return;
  try {
    const res = await fetch(`${API_BASE}/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", collection, slug, sha }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "No se pudo recuperar el artículo");
    }
    showSuccess("Artículo recuperado");
    loadTrash();
  } catch (err) {
    showError(err.message || "No se pudo recuperar el artículo");
  }
}

// --- Navegador de medios ---
async function loadMedia() {
  try {
    const res = await fetch(`${API_BASE}/content?collection=media&page=1`);
    if (!res.ok) {
      // Si la colección media no existe, mostrar lista vacía
      mediaItems = [];
      renderMediaList([]);
      return;
    }
    const data = await res.json();
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
  if (!items || items.length === 0) {
    mediaList.innerHTML = `<div class="empty">No hay imágenes subidas.</div>`;
    return;
  }

  mediaList.innerHTML = items.map((item) => {
    const url = safeMediaUrl(item.url);
    const image = url
      ? `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(item.alt)}" />`
      : `<div class="media-placeholder">Sin imagen</div>`;
    return `
      <div class="media-item" data-media-index="${mediaItems.indexOf(item)}">
        ${image}
        <div class="media-item-name">${escapeHtml(item.name)}</div>
      </div>
    `;
  }).join("");
}

function selectMediaItem(element, url, alt) {
  // Deselect all
  document.querySelectorAll(".media-item").forEach((el) =>
    el.classList.remove("selected")
  );
  element.classList.add("selected");
  selectedMediaItem = { url, alt };
  insertImageBtn.disabled = false;
  insertImageBtn.textContent = `Insertar "${alt}" en el cuerpo`;
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
  if (!file.type.startsWith("image/")) {
    showError("Solo se permiten archivos de imagen.");
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showError("La imagen no puede superar los 2 MB.");
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection, slug, mimeType: file.type, filename: file.name,
        alt: imageAlt.value || file.name, data: btoa(binary),
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "No se pudo subir la imagen");
    }
    const data = await res.json();
    currentImageFile = null;
    currentImageUrl = data.url;
    imageInput.value = "";
    imagePreviewImg.src = data.url;
    imagePreview.style.display = "block";
    mediaItems.unshift({ name: file.name, url: data.url, alt: data.alt || imageAlt.value, slug });
    renderMediaList(mediaItems);
    showSuccess("Imagen subida correctamente");
    return data.url;
  } catch (err) {
    showError(err.message || "No se pudo subir la imagen");
    return null;
  }
}