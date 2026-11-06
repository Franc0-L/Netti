import { describe, expect, it } from "vitest";
import { validate } from "../api/_lib/content/validation.js";

function validNews(publishedAt: string) {
  return validate(
    "news",
    {
      title: "Noticia",
      description: "Descripción de la noticia",
      publishedAt,
      category: "Noticias",
      author: "Netti",
    },
    "Contenido de la noticia.",
  );
}

describe("validación estricta de fechas editoriales", () => {
  it("acepta una fecha calendario válida", () => {
    expect(validNews("2026-11-05")).toBeUndefined();
  });

  it("acepta el 29 de febrero en un año bisiesto", () => {
    expect(validNews("2024-02-29")).toBeUndefined();
  });

  it.each(["2026-02-31", "2025-02-29", "2026-13-01", "2026-04-00"])(
    "rechaza una fecha inexistente: %s",
    (date) => {
      expect(validNews(date)).toContain("formato AAAA-MM-DD");
    },
  );
});
