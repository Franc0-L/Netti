import { beforeAll, describe, expect, it, vi } from "vitest";

const fixtures = Array.from({ length: 60 }, (_, index) => ({
  type: "blob",
  path: `content/games/game-${String(index + 1).padStart(2, "0")}.md`,
  sha: `game-${index + 1}`,
}));
fixtures.push({
  type: "blob",
  path: "content/reviews/review-extra.md",
  sha: "review-extra",
});

vi.mock("../api/_lib/github/contents.js", () => ({
  getTree: vi.fn(async () => fixtures),
  readMarkdownBlob: vi.fn(async (sha: string) => ({
    fields: {
      title: sha === "game-57" ? "Pokémon Zelda" : `Game ${sha.replace("game-", "")}`,
      description: "Descripción de prueba",
    },
    body: "",
    sha,
  })),
  readMarkdownFile: vi.fn(),
}));

import { listEntries } from "../api/_lib/content/repository.js";

describe("búsqueda del administrador", () => {
  it("encuentra publicaciones fuera de la primera página y no mezcla colecciones", async () => {
    const result = await listEntries("games", 1, "pokemon");

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].slug).toBe("game-57");
    expect(result.entries[0].collection).toBe("games");
  });

  it("pagina el conjunto completo de resultados", async () => {
    const result = await listEntries("games", 2, "game");

    expect(result.total).toBe(60);
    expect(result.pageCount).toBe(2);
    expect(result.entries).toHaveLength(10);
    expect(result.entries[0].slug).toBe("game-51");
  });
});
