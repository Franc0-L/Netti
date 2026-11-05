import { defineMiddleware } from "astro:middleware";

// Caché HTTP de las respuestas generadas en el servidor.
const CACHEABLE_CONTENT_TYPES = ["text/html", "application/json"];
const CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  if (context.request.method !== "GET" || response.status !== 200) {
    return response;
  }

  const { pathname } = context.url;
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/media")
  ) {
    return response;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const cacheable = CACHEABLE_CONTENT_TYPES.some((type) =>
    contentType.includes(type),
  );
  if (cacheable) {
    response.headers.set("Cache-Control", CACHE_CONTROL);
  }

  return response;
});
