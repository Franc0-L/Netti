import type { APIRoute } from "astro";
import {
  getCollectionEntries,
  isValidCollection,
  type GamesData,
  type ReviewsData,
  type NewsData,
  type GuidesData,
} from "../lib/fetch-content";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

type SearchItem = {
  type: string;
  slug: string;
  title: string;
  description: string;
  url: string;
  meta: string;
};

export const GET: APIRoute = async () => {
  const collections: ("games" | "reviews" | "news" | "guides")[] = [
    "games",
    "reviews",
    "news",
    "guides",
  ];

  let items: SearchItem[] = [];

  for (const collection of collections) {
    if (!isValidCollection(collection)) continue;

    try {
      const entries = await getCollectionEntries(collection);

      for (const entry of entries) {
        const id = entry.id;

        switch (collection) {
          case "games": {
            const data = entry.data as GamesData;
            items.push({
              type: "Juego",
              slug: id,
              title: data.title,
              description: data.description,
              url: `/juegos/${id}/`,
              meta: `${data.releaseYear} · ${data.genres.join(", ")}`,
            });
            break;
          }
          case "reviews": {
            const data = entry.data as ReviewsData;
            items.push({
              type: "Reseña",
              slug: id,
              title: data.title,
              description: data.description,
              url: `/resenas/${id}/`,
              meta: `Puntuación: ${data.score} · ${dateFormatter.format(
                new Date(data.publishedAt),
              )}`,
            });
            break;
          }
          case "news": {
            const data = entry.data as NewsData;
            items.push({
              type: "Noticia",
              slug: id,
              title: data.title,
              description: data.description,
              url: `/noticias/${id}/`,
              meta: `${data.category} · ${dateFormatter.format(
                new Date(data.publishedAt),
              )}`,
            });
            break;
          }
          case "guides": {
            const data = entry.data as GuidesData;
            items.push({
              type: "Guía",
              slug: id,
              title: data.title,
              description: data.description,
              url: `/guias/${id}/`,
              meta: `Guía · ${dateFormatter.format(
                new Date(data.publishedAt),
              )}`,
            });
            break;
          }
        }
      }
    } catch {
      // Si una colección falla, continuamos con las demás
      continue;
    }
  }

  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
