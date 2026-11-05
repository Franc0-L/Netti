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
const editGame = document.getElementById("edit-game");
const editScore = document.getElementById("edit-score");
const editTags = document.getElementById("edit-tags");
const gameRefGroup = document.getElementById("game-ref-group");
const scoreGroup = document.getElementById("score-group");

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
  editGame.value = "";
  editScore.value = "";
  editTags.value = "";

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
    editGame.value = entry.fields.game || "";
    editScore.value = entry.fields.score || "";
    editTags.value = (entry.fields.tags || []).join(", ");

    gameRefGroup.style.display =
      entry.collection === "reviews" || entry.collection === "guides"
        ? "block"
        : "none";
    scoreGroup.style.display =
      entry.collection === "reviews" ? "block" : "none";

    modalTitle.textContent = `Editar ${collectionLabels[collection]}`;
    modalOverlay.style.display = "flex";
    editTitle.focus();
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

// Exponer API global para onclick en HTML
window.app = {
  loadCollection,
  loadPage: (page) => loadCollection(currentCollection, page),
  editArticle,
  deleteArticle,
};

// Inicializar
checkAuth().then(() => {
  const firstLink = sidebarLinks[0];
  if (firstLink) {
    const collection = firstLink.dataset.collection;
    loadCollection(collection);
  }
});
