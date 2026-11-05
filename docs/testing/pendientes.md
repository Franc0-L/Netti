# Pruebas pendientes

El siguiente estado resume qué pruebas están implementadas y qué falta.

## Implementadas (vitest)

| Archivo | Qué prueba | Estado |
|---------|------------|--------|
| `tests/accessibility.test.ts` | Páginas usan BaseLayout, imágenes con alt, inputs con label/aria-label | ✅ Pasando |
| `tests/performance.test.ts` | `astro build` completa en <60s, `dist/` existe | ✅ Pasando |

## Pendientes (a portar del legacy o crear nuevas)

El legacy tenía tests con `node:test` que no se han migrado aún:

| Test del legacy | Qué probaba | Prioridad |
|-----------------|-------------|-----------|
| `a11y-axe.test.mjs` | Violaciones axe-core (WCAG 2.1/2.2 AA) en HTML construido | Alta |
| `performance.test.mjs` | Tamaño bundle JS (<500 KB), CSS (<200 KB), imágenes (<2 MB) | Alta |
| `build-smoke.test.mjs` | Build exitoso, output: server, archivos estáticos, vercel.json, páginas [slug] usan /404 | Alta |
| `security-headers.test.mjs` | Cabeceras de seguridad en vercel.json | Media |
| `media-url.test.mjs` | Endpoint `/media/[...path]` responde en <200ms, caché funciona | Media |
| `markdown-sanitize.test.mjs` | Sanitizado de HTML en Markdown | Media |
| `admin-api.test.mjs` | API de contenido (login, crear, editar, borrar) | Alta |
| `admin-contract.test.mjs` | Contrato editorial coherente entre lectura y escritura | Alta |
| `admin-e2e.test.mjs` | Flujo completo del panel editorial | Media |
| `platform-logos.test.mjs` | Catálogo de logos de plataformas | Baja |
| `ssr-runtime.test.mjs` | Renderizado en runtime (SSR) | Media |

## Cómo ejecutar

```bash
# Tests actuales (vitest)
npx vitest run

# Type check
npm run check

# Build
npm run build
```
