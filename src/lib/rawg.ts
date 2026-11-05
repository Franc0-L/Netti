export interface RawgGame {
  title: string;
  released?: string | null;
  rating?: number | null;
  metacritic?: number | null;
  platforms: string[];
  url: string;
}

// Obtiene datos complementarios de un juego desde la API de RAWG. Si no hay API key configurada o falla la petición, devuelve null silenciosamente.
export async function getRawdGame(title: string): Promise<RawgGame | null> {
  const apiKey =
    typeof process !== "undefined" ? process.env.RAWG_API_KEY : undefined;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(title)}&page_size=1`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;

    return {
      title: result.name ?? title,
      released: result.released ?? null,
      rating: result.rating ?? null,
      metacritic: result.metacritic ?? null,
      platforms: (result.platforms ?? []).map(
        (p: { platform: { name: string } }) => p.platform.name,
      ),
      url: `https://rawg.io/games/${result.slug ?? ""}`,
    };
  } catch {
    return null;
  }
}
