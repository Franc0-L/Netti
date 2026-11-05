import { describe, expect, it } from "vitest";
import { validate } from "../api/_lib/content/validation.js";

describe("validación por colección", () => {
  it("no exige puntuación a noticias", () => {
    expect(validate("news", { title: "Noticia", description: "Descripción", publishedAt: "2026-11-05", category: "Noticias", author: "Netti" }, "Contenido.")).toBeUndefined();
  });
  it("no exige puntuación a guías", () => {
    expect(validate("guides", { title: "Guía", description: "Descripción", publishedAt: "2026-11-05" }, "Contenido.")).toBeUndefined();
  });
  it("sí exige puntuación a reseñas", () => {
    expect(validate("reviews", { title: "Reseña", description: "Descripción", game: "juego", publishedAt: "2026-11-05", scoreReason: "Justificación suficientemente extensa.", verdict: "Veredicto" }, "Contenido.")).toContain("score");
  });
});
