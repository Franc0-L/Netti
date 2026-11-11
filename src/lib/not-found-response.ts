/**
 * Branded 404 response rendered by the proxy.
 *
 * The App Router cannot change the status code once a streamed response has
 * started, so the proxy answers unknown public paths with this document. It
 * mirrors the copy and the palette of `src/app/not-found.tsx`.
 */
export function notFoundHtml(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>404 — Página no encontrada | Netti</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0d0b12;
        color: #f4f0fa;
        font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
      }
      main { width: min(560px, calc(100% - 48px)); text-align: center; }
      .eyebrow {
        color: #b79aff;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      h1 { margin: 18px 0 10px; font-size: clamp(2rem, 6vw, 3.2rem); letter-spacing: -0.06em; }
      p.copy { color: #aaa1b8; line-height: 1.7; }
      a {
        display: inline-block;
        margin-top: 24px;
        padding: 14px 19px;
        border: 1px solid #b79aff;
        color: #f4f0fa;
        background: rgba(183, 154, 255, 0.1);
        font-weight: 700;
        text-decoration: none;
      }
      a:focus-visible { outline: 2px solid #d1bdff; outline-offset: 4px; }
    </style>
  </head>
  <body>
    <main id="contenido">
      <p class="eyebrow">ERROR 404</p>
      <h1>Esta página no existe.</h1>
      <p class="copy">El enlace puede estar roto o el contenido ya no estar disponible.</p>
      <a href="/">Volver a Netti</a>
    </main>
  </body>
</html>
`;
}
