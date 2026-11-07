import { describe, expect, it } from "vitest";
import { validate } from "../api/_lib/content/validation.js";

function validNews(extra: Record<string, unknown> = {}) {
  return {
    title: "Noticia",
    description: "Descripción",
    publishedAt: "2026-11-05",
    category: "Noticias",
    author: "Netti",
    ...extra,
  };
}

describe("validación por colección", () => {
  it("no exige puntuación a noticias", () => {
    expect(validate("news", validNews(), "Contenido.")).toBeUndefined();
  });
  it("no exige puntuación a guías", () => {
    expect(validate("guides", { title: "Guía", description: "Descripción", publishedAt: "2026-11-05" }, "Contenido.")).toBeUndefined();
  });
  it("sí exige puntuación a reseñas", () => {
    expect(validate("reviews", { title: "Reseña", description: "Descripción", game: "juego", publishedAt: "2026-11-05", scoreReason: "Justificación suficientemente extensa.", verdict: "Veredicto" }, "Contenido.")).toContain("score");
  });
});

describe("contrato editorial en la validación del panel", () => {
  it("acepta una URL fuente http/https", () => {
    expect(
      validate("news", validNews({ sourceUrl: "https://ejemplo.com/nota" }), "Contenido."),
    ).toBeUndefined();
  });

  it("rechaza una URL fuente javascript:", () => {
    const error = validate(
      "news",
      validNews({ sourceUrl: "javascript:alert(1)" }),
      "Contenido.",
    );
    expect(error).toContain("HTTP o HTTPS");
  });

  it("rechaza una URL de video que no sea http/https", () => {
    const error = validate(
      "news",
      validNews({ videoUrl: "data:text/html;base64,PHNjcmlwdD4=" }),
      "Contenido.",
    );
    expect(error).toContain("HTTP o HTTPS");
  });

  it("tolera sourceUrl vacío o nulo", () => {
    expect(validate("news", validNews({ sourceUrl: "" }), "Contenido.")).toBeUndefined();
    expect(validate("news", validNews({ sourceUrl: null }), "Contenido.")).toBeUndefined();
  });

  it("rechaza featured que no sea booleano", () => {
    const error = validate("news", validNews({ featured: "sí" }), "Contenido.");
    expect(error).toContain("featured");
  });

  it("rechaza imágenes svg (no servibles por /media/)", () => {
    const error = validate(
      "news",
      validNews({ coverImage: "/media/news/demo/portada.svg", coverAlt: "Portada" }),
      "Contenido.",
    );
    expect(error).toContain("imagen local");
  });
});
