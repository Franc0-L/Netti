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

// Elementos DOM
const sidebarLinks = document.querySelectorAll(".nav-link");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");
const contentArea = document.getElementById("content-area");
const errorMsg = document.getElementById("error-msg");
const successMsg = document.getElementById("success-msg");
const newBtn = document.getElementById("new-btn");
const previewBtn = document.getElementById("preview-btn");

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdownPreview(markdown) {
  if (!markdown || !markdown.trim()) {
    return "<p style='color: var(--muted); font-style: italic;'>Sin contenido...</p>";
  }

  let html = markdown
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(
      /!\[(.*?)\]\((.*?)\)/g,
      '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 0.5rem; margin: 1rem 0;" />',
    )
    .replace(
      /\[(.*?)\]\((.*?)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  return `<p>${html}</p>`;
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

  try {
    const res = await fetch(
      `${API_BASE}/content?collection=${collection}&page=${page}`,
    );
    if (!res.ok) throw new Error("No se pudo cargar la colección");
    const data = await res.json();

    renderList(data.entries, data.page, data.pageCount, data.total);
  } catch (err) {
    showError(err.message || "Error al cargar la colección");
    contentArea.innerHTML = `<div class="empty">Error al cargar los artículos.</div>`;
  }
}

function renderList(entries, page, pageCount, total) {
  if (!entries || entries.length === 0) {
    contentArea.innerHTML = `
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
      const title = escapeHtml(entry.fields.title || entry.slug);
      const slug = escapeHtml(entry.slug);
      const updated = entry.fields.updatedAt || entry.fields.publishedAt || "";
      return `
      <tr>
        <td><span class="badge ${badgeClass}">${entry.collection}</span></td>
        <td>${title}</td>
        <td><code style="color:#b6adc9;">${slug}</code></td>
        <td>${updated}</td>
        <td>
          <button class="btn-secondary" onclick="app.editArticle('${escapeHtml(entry.slug)}', '${escapeHtml(entry.collection)}', '${escapeHtml(entry.sha || "")}')">Editar</button>
          <button class="btn-danger" onclick="app.deleteArticle('${escapeHtml(entry.slug)}', '${escapeHtml(entry.collection)}')">Borrar</button>
        </td>
      </tr>
    `;
    })
    .join("");

  const pagination =
    pageCount > 1
      ? `
      <div class="pagination">
        ${page > 1 ? `<a onclick="app.loadPage(${page - 1})">← Anterior</a>` : `<span class="disabled">← Anterior</span>`}
        <span class="current">Página ${page} de ${pageCount}</span>
        ${page < pageCount ? `<a onclick="app.loadPage(${page + 1})">Siguiente →</a>` : `<span class="disabled">Siguiente →</span>`}
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

async function createArticle() {
  editId.value = "";
  editCollection.value = currentCollection;
  editTitle.value = "";
  editSlug.value = "";
  editDescription.value = "";
  editBody.value = "";
  editPreview.innerHTML = "";
  editGame.value = "";
  editScore.value = "";
  editTags.value = "";

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
    editCollection.value = entry.collection;
    editTitle.value = entry.fields.title || "";
    editSlug.value = entry.slug;
    editDescription.value = entry.fields.description || "";
    editBody.value = entry.body || "";
    editPreview.innerHTML = renderMarkdownPreview(entry.body || "");
    editGame.value = entry.fields.game || "";
    editScore.value = entry.fields.score || "";
    editTags.value = (entry.fields.tags || []).join(", ");

    currentImageFile = null;
    currentImageUrl = null;
    imageInput.value = "";
    imagePreview.style.display = "none";
    imageAlt.value = entry.fields.coverAlt || "";

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

async function deleteArticle(slug, collection) {
  if (!confirm(`¿Estás seguro de que querés borrar "${slug}"?`)) return;

  try {
    const res = await fetch(`${API_BASE}/content`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, slug, sha: "" }),
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
    body: editBody.value.trim(),
    tags: editTags.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    coverAlt: imageAlt.value.trim(),
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
    body: fields.body,
  };
  if (isEdit) body.sha = "";

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
        const slug = escapeHtml(entry.slug);
        const deletedAt = entry.fields.deletedAt || "";
        const deletedCollection = entry.collection || "games";
        return `
        <tr>
          <td><span class="badge badge-games">${deletedCollection}</span></td>
          <td>${title}</td>
          <td><code style="color: var(--muted);">${slug}</code></td>
          <td>${deletedAt}</td>
          <td>
            <button class="btn-secondary" onclick="app.recoverArticle('${escapeHtml(slug)}', '${escapeHtml(deletedCollection)}')">Recuperar</button>
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

async function recoverArticle(slug, collection) {
  if (!confirm(`¿Recuperar "${slug}"?`)) return;
  try {
    const res = await fetch(`${API_BASE}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection,
        slug,
        fields: { title: slug },
        body: "",
        sha: "",
      }),
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

  mediaList.innerHTML = items
    .map(
      (item) => `
      <div class="media-item" onclick="selectMediaItem(this, '${item.url}', '${item.alt}')">
        ${item.url ? `<img src="${item.url}" alt="${item.alt}" />` : `<div style="width:100%;height:100px;background:var(--field);border-radius:0.4rem;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:0.75rem">Sin imagen</div>`}
        <div class="media-item-name">${escapeHtml(item.name)}</div>
      </div>
    `
    )
    .join("");
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

// Exponer API global para onclick en HTML
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
  if (!currentImageFile) return null;
  const formData = new FormData();
  formData.append("file", currentImageFile);
  formData.append("collection", collection);
  formData.append("slug", slug);
  formData.append("alt", imageAlt.value || currentImageFile.name);
  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "No se pudo subir la imagen");
    }
    const data = await res.json();
    currentImageFile = null;
    currentImageUrl = data.url;
    imageInput.value = "";
    imagePreview.style.display = "none";
    imageAlt.value = "";
    showSuccess("Imagen subida correctamente");
    // Agregar a la lista de medios y recargar
    mediaItems.unshift({
      name: data.path.split("/").pop() || data.url.split("/").pop(),
      url: data.url,
      alt: imageAlt.value || currentImageFile.name,
      slug: data.slug || "",
    });
    renderMediaList(mediaItems);
    return data.url;
  } catch (err) {
    showError(err.message || "No se pudo subir la imagen");
    return null;
  }
}
