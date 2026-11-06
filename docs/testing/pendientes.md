# Estado de las pruebas

Este documento distingue las comprobaciones automatizadas que ya existen de las pruebas que todavía faltan. Las pruebas actuales no deben confundirse con una prueba completa del navegador o de los endpoints desplegados.

## Implementadas

| Archivo | Cobertura actual | Alcance |
| --- | --- | --- |
| `tests/accessibility.test.ts` | Comprueba el uso de BaseLayout, atributos alt e inputs etiquetados en fuentes Astro | Estática |
| `tests/admin-api.test.ts` | Comprueba contratos básicos de autenticación, sesión, origen y subida | Estática; no ejecuta peticiones HTTP |
| `tests/admin-content-validation.test.ts` | Comprueba reglas básicas por colección | Unitarias |
| `tests/content-validation-edge-cases.test.ts` | Comprueba fechas reales, años bisiestos y fechas imposibles | Unitarias |
| `tests/build-smoke.test.ts` | Comprueba configuración SSR/Vercel, cabeceras y rutas 404 | Estática |
| `tests/markdown-sanitize.test.ts` | Comprueba la configuración de sanitización y resolución de imágenes | Estática |
| `tests/media-url.test.ts` | Comprueba validaciones de formato, traversal y caché del endpoint multimedia | Estática |
| `tests/media-audit.test.ts` | Comprueba referencias de imágenes, papelera y detección de archivos huérfanos | Unitarias |
| `tests/performance.test.ts` | Ejecuta el build y comprueba el tiempo y la existencia de dist/ | Integración local |
| `tests/platform-logos.test.ts` | Comprueba el catálogo de logos | Unitarias |
| `tests/security-headers.test.ts` | Comprueba las cabeceras configuradas | Estáticas |

## Pendientes

| Prueba | Qué falta | Prioridad |
| --- | --- | --- |
| `tests/admin-content-handler.test.ts` | Ejecuta el handler real con GitHub y servicios mockeados; cubre sesión, origen, token, listado, creación, conflicto SHA, borrado y restauración | Unitarias de integración |
| API Admin con mocks | Ejecutar handlers reales con solicitudes/respuestas simuladas y GitHub API mockeada; cubrir CRUD, conflictos SHA, papelera y restauración | Alta |
| Admin E2E | Automatizar login, creación, edición, vista previa, subida, borrado y restauración desde un navegador real | Alta |
| Accesibilidad axe | Ejecutar axe-core sobre HTML renderizado, no solo revisar archivos fuente | Alta |
| SSR/runtime | Probar páginas y respuestas HTTP contra un servidor de preview | Media |
| Multimedia HTTP | Probar respuestas reales, caché, tipos MIME, errores y rutas inválidas del endpoint | Media |
| Recuperación multimedia | Diseñar un flujo explícito de limpieza con confirmación y protección de referencias compartidas; no borrar automáticamente | Media |

## Ejecución

```bash
npm run check
npm run test
npm run build
npm run audit:media -- ../Contenido-Netti
```

La auditoría multimedia es informativa: incluye las publicaciones de la papelera para proteger imágenes recuperables y nunca modifica ni elimina archivos.
