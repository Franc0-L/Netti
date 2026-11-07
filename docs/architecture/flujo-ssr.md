# Flujo SSR — Cómo se renderizan las páginas

Netti usa `output: "server"` con el adaptador de Vercel. Cada visita a una página genera el HTML en el servidor en tiempo real (no hay pre-renderizado estático de contenido editorial).

## Flujo de una página pública (ej. `/juegos/mi-juego/`)

```
1. Usuario solicita /juegos/mi-juego/
2. Astro SSR ejecuta la página src/pages/juegos/[slug].astro
3. La página llama a getCollectionEntry("games", "mi-juego")
4. fetch-content.ts consulta GitHub: GET /repos/{repo}/contents/content/games/mi-juego.md
5. GitHub devuelve el archivo .md (frontmatter YAML + cuerpo Markdown)
6. fetch-content valida el frontmatter contra el schema Zod de games
7. Se normalizan las rutas de imagen (/images/editorial/ → /media/)
8. Se renderiza el Markdown a HTML (`marked` + `hast-util-sanitize`)
9. BaseLayout envuelve el artículo con head, nav, footer, etc.
10. Se devuelve HTML al navegador con cabeceras de caché
```

## Caché en memoria (fetch-content.ts)

- **TTL**: 60 segundos por entrada
- **Máximo**: 200 entradas en caché
- **Deduplicación**: Llamadas concurrentes al mismo recurso se resuelven con una sola petición a GitHub
- **Invalidación**: `clearContentCache()` vacía toda la caché (útil tras publicar)

## Middleware de caché HTTP

- Aplica `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300` a respuestas HTML y JSON de 200
- No cachea rutas bajo `/admin`, `/api` ni `/media`
- El CDN de Vercel puede reutilizar el HTML durante 1 minuto (s-maxage)

## Endpoint de medios (`/media/[...path]`)

- Descarga imágenes del repositorio privado usando el token del servidor
- Valida "magic bytes" para verificar que el archivo sea realmente una imagen
- Caché en memoria: 5 minutos TTL, máximo 80 entradas
- Responde con `Cache-Control` agresivo (1 día) ya que las imágenes no cambian
