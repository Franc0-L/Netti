import { escapeHtml, escapeAttribute, safeMediaUrl } from "./html-safety.js";

const collectionBadges = {
  games: "badge-games",
  reviews: "badge-reviews",
  news: "badge-news",
  guides: "badge-guides",
};

export function renderCollectionList({
  entries = [],
  page = 1,
  pageCount = 0,
  query = "",
  isSearching = false,
} = {}) {
  if (entries.length === 0) {
    return isSearching
      ? `<div class="empty">No encontramos publicaciones que coincidan con “${escapeHtml(query)}”. Probá con otro título o nombre.</div>`
      : `<div class="empty">
        Todavía no hay artículos en esta colección.<br>
        Hacé clic en "Nuevo artículo" para crear uno.
      </div>`;
  }

  const rows = entries.map((entry) => {
    const badgeClass = collectionBadges[entry.collection] || "";
    const title = escapeHtml(entry.fields?.title || entry.slug);
    const slug = escapeHtml(entry.slug);
    const slugAttr = escapeAttribute(entry.slug);
    const updated = escapeHtml(entry.fields?.updatedAt || entry.fields?.publishedAt || "");
    return `<tr>
      <td><span class="badge ${badgeClass}">${escapeHtml(entry.collection)}</span></td>
      <td>${title}</td>
      <td><code style="color:#b6adc9;">${slug}</code></td>
      <td>${updated}</td>
      <td>
        <button class="btn-secondary" data-action="edit" data-slug="${slugAttr}" data-collection="${escapeAttribute(entry.collection)}" data-sha="${escapeAttribute(entry.sha || "")}">Editar</button>
        <button class="btn-danger" data-action="delete" data-slug="${slugAttr}" data-collection="${escapeAttribute(entry.collection)}" data-sha="${escapeAttribute(entry.sha || "")}">Borrar</button>
      </td>
    </tr>`;
  }).join("");

  const pagination = pageCount > 1
    ? `<div class="pagination">
        ${page > 1 ? `<a data-page="${page - 1}">← Anterior</a>` : '<span class="disabled">← Anterior</span>'}
        <span class="current">Página ${page} de ${pageCount}</span>
        ${page < pageCount ? `<a data-page="${page + 1}">Siguiente →</a>` : '<span class="disabled">Siguiente →</span>'}
      </div>`
    : "";

  return `<table>
    <thead><tr><th>Colección</th><th>Título</th><th>Slug</th><th>Actualizado</th><th>Acciones</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>${pagination}`;
}

export function renderTrashList(entries = []) {
  if (entries.length === 0) return '<div class="empty">La papelera está vacía.</div>';
  const rows = entries.map((entry) => {
    const title = escapeHtml(entry.fields?.title || entry.slug);
    const slug = escapeHtml(entry.slug);
    const collection = entry.collection || "games";
    return `<tr>
      <td><span class="badge badge-games">${escapeHtml(collection)}</span></td>
      <td>${title}</td>
      <td><code style="color: var(--muted);">${slug}</code></td>
      <td>${escapeHtml(entry.fields?.deletedAt || "")}</td>
      <td><button class="btn-secondary" data-action="recover" data-slug="${escapeAttribute(entry.slug)}" data-collection="${escapeAttribute(collection)}" data-sha="${escapeAttribute(entry.sha || "")}">Recuperar</button></td>
    </tr>`;
  }).join("");
  return `<table>
    <thead><tr><th>Colección</th><th>Título</th><th>Slug</th><th>Eliminado</th><th>Acción</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderMediaList(items = [], allItems = items) {
  if (items.length === 0) return '<div class="empty">No hay imágenes subidas.</div>';
  return items.map((item) => {
    const url = safeMediaUrl(item.url);
    const image = url
      ? `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(item.alt)}" />`
      : '<div class="media-placeholder">Sin imagen</div>';
    return `<div class="media-item" data-media-index="${allItems.indexOf(item)}">
      ${image}
      <div class="media-item-name">${escapeHtml(item.name)}</div>
    </div>`;
  }).join("");
}
