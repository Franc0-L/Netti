const METADATA_FIELD_IDS = {
  releaseYear: "field-release-year",
  platforms: "field-platforms",
  genres: "field-genres",
  developer: "field-developer",
  publisher: "field-publisher",
  publishedAt: "field-published-at",
  author: "field-author",
  category: "field-category",
  sourceName: "field-source-name",
  sourceUrl: "field-source-url",
  scoreReason: "field-score-reason",
  verdict: "field-verdict",
  featured: "field-featured",
};

export function slugifyTitle(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createEditorForm({ documentRef = document } = {}) {
  const metadataFields = Object.fromEntries(
    Object.entries(METADATA_FIELD_IDS).map(([key, id]) => [key, documentRef.getElementById(id)]),
  );
  const tagsField = documentRef.getElementById("edit-tags");

  function resetMetadataFields() {
    Object.entries(metadataFields).forEach(([key, input]) => {
      if (!input) return;
      if (key === "featured") input.checked = false;
      else input.value = "";
    });
    Array.from(tagsField?.options ?? []).forEach((option) => { option.selected = false; });
  }

  function populateMetadataFields(fields = {}) {
    Object.entries(metadataFields).forEach(([key, input]) => {
      if (!input) return;
      if (key === "featured") input.checked = Boolean(fields[key]);
      else if (key === "platforms" || key === "genres") {
        input.value = Array.isArray(fields[key]) ? fields[key].join(", ") : "";
      } else {
        input.value = fields[key] ? String(fields[key]).slice(0, key === "publishedAt" ? 10 : undefined) : "";
      }
    });
    const selected = new Set(Array.isArray(fields.tags) ? fields.tags : []);
    Array.from(tagsField?.options ?? []).forEach((option) => { option.selected = selected.has(option.value); });
  }

  function setMetadataVisibility(collection) {
    documentRef.querySelectorAll("[data-collections]").forEach((group) => {
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
      fields.platforms = value("platforms").split(",").map((item) => item.trim()).filter(Boolean);
      fields.genres = value("genres").split(",").map((item) => item.trim()).filter(Boolean);
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

  function buildPayload({ collection, slug, title, description, body, game, score, coverAlt }) {
    const fields = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.from(tagsField?.selectedOptions ?? []).map((option) => option.value),
      coverAlt: coverAlt.trim(),
      ...collectMetadataFields(collection),
    };
    if (["reviews", "guides"].includes(collection) && game.trim()) fields.game = game.trim();
    if (collection === "reviews" && score) fields.score = Number.parseInt(score, 10);
    return { collection, slug: slug.trim(), fields, body: body.trim() };
  }

  return {
    resetMetadataFields,
    populateMetadataFields,
    setMetadataVisibility,
    collectMetadataFields,
    buildPayload,
  };
}
