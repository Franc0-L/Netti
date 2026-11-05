import type { CollectionEntry } from "./fetch-content";

type Card = {
  title: string;
  href: string;
  image?: string;
  alt?: string;
  score?: number;
};

// Devuelve juegos similares a partir de géneros y plataformas compartidas. Ordena primero por coincidencia de géneros, luego por año de lanzamiento más cercano.
export function getSimilarGames(
  game: CollectionEntry,
  allGames: CollectionEntry[] = [],
): Card[] {
  const targetGenres = new Set(
    ((game.data.genres as string[]) ?? []).map((g) => String(g)),
  );
  const targetPlatforms = new Set(
    ((game.data.platforms as string[]) ?? []).map((p) => String(p)),
  );

  const scored = allGames
    .filter((g) => g.id !== game.id)
    .map((g) => {
      const genres = new Set(
        ((g.data.genres as string[]) ?? []).map((gen) => String(gen)),
      );
      const platforms = new Set(
        ((g.data.platforms as string[]) ?? []).map((plat) => String(plat)),
      );
      let genreMatches = 0;
      for (const genre of targetGenres) if (genres.has(genre)) genreMatches++;
      let platformMatches = 0;
      for (const platform of targetPlatforms)
        if (platforms.has(platform)) platformMatches++;
      return {
        game: g,
        score: genreMatches * 2 + platformMatches,
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s): Card => ({
      title: String(s.game.data.title ?? ""),
      href: `/juegos/${s.game.id}/`,
      image: s.game.data.coverImage
        ? String(s.game.data.coverImage)
        : undefined,
      alt: s.game.data.coverAlt
        ? String(s.game.data.coverAlt)
        : String(s.game.data.title ?? ""),
    }));

  return scored;
}
