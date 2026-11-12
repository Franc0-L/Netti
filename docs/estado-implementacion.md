# Estado real de implementación

Este documento separa el diseño objetivo de las capacidades que existen en el repositorio. Actualizarlo cuando un cambio se integre o una validación se complete.

Última actualización: 12 de noviembre de 2026, sobre `main` (`1ad6c9a`) con las correcciones de la auditoría técnica aplicadas en el árbol de trabajo.

## Código presente y validado localmente

| Área                       | Implementación visible                                                                                                              | Estado de validación                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Framework                  | Next.js 16.4.5 App Router, Cache Components y TypeScript estricto                                                                   | Typecheck y build locales aprobados; CI pendiente de ejecutar sobre el commit final       |
| Dependencias               | Lockfile versionado, `npm ci` reproducible, `overrides` para zod                                                                    | `npm ci` aprobado; `npm audit --omit=dev` = 0 vulnerabilidades                            |
| Calidad                    | ESLint sin warnings, Prettier normalizado para LF en todo el repo                                                                   | `lint`, `format:check`, `typecheck` y `test` aprobados localmente                         |
| Base de datos              | Pool pg (`DATABASE_POOL_MAX`, 2 por defecto), Drizzle y baseline SQL versionado                                                     | Migración aplicada en PostgreSQL 18.6: 10 tablas, 34 índices, 122 constraints, 4 triggers |
| Health / readiness         | `/api/health` liveness sin DB ni Blob; `/api/ready` con DB/Blob y Bearer                                                            | Probados por HTTP contra servidor real                                                    |
| Lectura pública            | Portada, colecciones y páginas de artículo por tipo/slug                                                                            | Build y smoke HTTP aprobados; falta contenido real en producción                          |
| Visibilidad                | Solo artículos publicados cuya fecha ya llegó                                                                                       | `cron_runs` con cursor probado vía `/api/revalidate`                                      |
| Markdown                   | React Markdown, GFM, sanitización rehype y resolución de `media:<id>` a Blob con variantes                                          | Tests XSS y de resolución de medios aprobados                                             |
| SEO                        | Metadata base, Open Graph, canonical, robots, sitemap con `lastModified` y JSON-LD `Article`                                        | Comprobado por HTTP: idioma, título, viewport, canonical y sitemap presentes              |
| Accesibilidad              | Skip link, landmarks, foco visible, `aria-current`, contraste, objetivos de 24 px, errores asociados y aviso a lectores de pantalla | Comprobado por HTTP; falta revisión manual con lector de pantalla y teclado               |
| Errores HTTP               | 404 real desde el proxy para rutas, colecciones y artículos inexistentes; 307 de `/admin` sin cookie; 308 de slugs anteriores       | Comprobado por HTTP contra el servidor local (27/27)                                      |
| Validación                 | Esquema Zod discriminado; pruebas de publicación, etiquetas y URL                                                                   | Tests aprobados                                                                           |
| Blob e imágenes            | Upload autenticado de 2 MB con límite real de cuerpo, magic bytes, MIME, Sharp, WebP y variantes 480/960/1600                       | Límite de cuerpo y rechazo de origen probados por HTTP; subida real a Blob pendiente      |
| Sesiones                   | login/logout/logoutAll con scrypt asíncrono, token opaco, digest en BD, expiración y rate limit atómico por IP                      | Probado contra PostgreSQL real, incluida concurrencia                                     |
| Server Actions editoriales | createArticle, updateArticle y publishArticle con Zod, control de sesión/origen, revisión transaccional y cache tags                | Typecheck/build aprobados; probado el control de origen y sesión vía HTTP                 |
| Cron y limpieza            | GET /api/cron/cleanup con bearer secret, retención de 7 días y reintento acotado de Blob huérfano                                   | Purga de sesiones/intentos probada contra DB real; Blob real pendiente                    |
| Reconciliación             | POST /api/reconcile-storage basado en DB, guarda tras restauración y `lastSuccessAt` solo en ejecuciones limpias                    | Código presente; ejecución con Blob real pendiente                                        |
| Backups                    | Scripts `db:backup` y `db:restore` con validación de destino y marca `backup_restored_at`                                           | Ciclo completo ejecutado antes de agregar la marca; falta repetirlo y comprobar el 409    |
| Scheduler                  | `.github/workflows/scheduled-jobs.yml`: revalidación cada 30 min, limpieza y reconciliación diarias                                 | Configuración presente; primera ejecución real pendiente de secretos en GitHub            |
| CI                         | `quality.yml` con `npm ci`, Node 24, actions v5, audit y job de integración con PostgreSQL 18                                       | Pendiente de ejecutar en GitHub sobre el commit final                                     |

## Criterios para declarar algo terminado

- Implementado: el código existe y está conectado a una ruta o flujo real.
- Typecheck aprobado: check de CI completado correctamente.
- Tests aprobados: suite automatizada ejecutada y aprobada.
- Build aprobado: check de build de producción completado correctamente.
- Integración validada: prueba contra un entorno de prueba con dependencias reales.
- Producción validada: comportamiento observado en el deployment real, con evidencia y fecha.

No usar “funciona”, “seguro”, “rápido” o “listo para producción” basándose solo en que un archivo fue agregado.

## Validaciones ejecutadas

Comandos locales (Node 24.22.2):

| Comprobación           | Resultado                                               |
| ---------------------- | ------------------------------------------------------- |
| `npm ci`               | Instalación limpia desde el lockfile                    |
| `npm audit --omit=dev` | 0 vulnerabilidades                                      |
| `npm test`             | 33 tests aprobados                                      |
| `npm run lint`         | 0 errores, 0 warnings                                   |
| `npm run format:check` | Todo el repositorio conforme                            |
| `npm run typecheck`    | Aprobado                                                |
| `npm run build`        | Aprobado (Next.js 16.4.5)                               |
| `npm run test:db`      | 8/8 comprobaciones contra PostgreSQL 18.6               |
| `npm run test:http`    | 27/27 comprobaciones contra el servidor local           |
| `npm run db:backup`    | Dump custom generado y validado con `pg_restore --list` |
| `npm run db:restore`   | Restauración completa en base local de prueba           |

`test:db` cubre: creación de las diez tablas, constraints y triggers, validación de origen contra `PUBLIC_SITE_URL`, tokens de sesión (solo se persiste el digest), backoff tras cinco fallos, atomicidad de 10 intentos concurrentes (exactamente 5 permitidos) y aceptación de la contraseña correcta con ventana limpia. Los fixtures usan identificadores e IPs propios de cada ejecución y cada script exige que `DATABASE_URL` apunte a loopback; una base remota se rechaza aunque su nombre termine en `_test`.

`test:http` cubre: liveness, readiness autenticado con DB real, CSP pública compatible con scripts inline, CSP de `/admin` con nonce aplicado a las etiquetas `<script>`, 404 real para rutas y slugs inexistentes, redirección permanente 308 de una ruta legacy hacia su artículo actual (con su `Location`), metadatos de Twitter en el artículo (`card`, `title` e `image`), `aria-current` del wordmark en la portada y del enlace de la colección activa, redirección de `/admin` sin sesión, panel accesible con sesión válida, idioma y metadatos (título, viewport, canonical), skip link antes de la navegación, un único `h1` e imágenes con `alt`, `robots.txt` y `sitemap.xml`, rechazo de sesión ausente o falsificada, aceptación de sesión válida, autorización del cron, purga de sesiones/intentos, revalidación de publicación programada, rechazo de origen externo en upload, límite real de cuerpo sin `Content-Length` y rechazo de archivos que no son imagen. Las filas de `cron_runs` que sobrescriben los endpoints programados se fotografían antes y se restauran al terminar, en lugar de borrarse.

## Pendientes

1. Ejecutar el workflow completo en GitHub sobre el commit final (no se hizo push desde este entorno) y confirmar que el job de integración deja de fallar por el origen.
2. Configurar `NETTI_SITE_URL` y `CRON_SECRET` en GitHub, ejecutar `workflow_dispatch` y comprobar `cron_runs` para los tres jobs programados.
3. Probar la subida real a Vercel Blob (formatos, EXIF, orientación, variantes, compensación de errores y reconciliación). Requiere credenciales reales.
4. Repetir el ciclo backup → restore con la marca `backup_restored_at` y comprobar que la reconciliación responde `409`.
5. Validar en runtime las redirecciones 308 de slugs anteriores en producción (el smoke HTTP ya las cubre contra el servidor local) y la resolución de imágenes `media:<id>` con datos reales.
6. Validar CSP y flujo del panel en un navegador real, más allá de la comprobación de cabeceras y nonce.
7. Probar login, renovación, expiración y logout contra un esquema Neon de prueba.
8. Revisar accesibilidad con lector de pantalla, navegación por teclado y zoom al 200 % sobre un deployment real: la revisión automática por HTTP ya está cubierta.
9. Medir el costo del control de 404 del proxy en un deployment real (consultas por minuto y por instancia) y ajustar el presupuesto de confirmaciones si el tráfico de rastreadores lo agota.
10. Añadir vista previa de Markdown en el editor si se considera necesaria (debe reutilizar `MarkdownContent`).

## Advertencias técnicas abiertas

- La política de caché debe validarse con las reglas de Cache Components de la versión instalada y con `x-vercel-cache`; no inferir persistencia compartida entre instancias.
- El contenido Markdown se sanitiza con un esquema de rehype-sanitize que solo agrega el protocolo `media:`. La URL final de una imagen del cuerpo siempre sale de la tabla `media`, nunca del texto Markdown.
- La UI administrativa permite elegir portada, Open Graph e insertar una referencia `media:<id>` en el cuerpo desde la biblioteca de medios.
- `cacheLife("minutes")` es deliberado: acota el retraso de visibilidad de publicaciones programadas. `/api/revalidate` reduce ese retraso, pero la garantía final depende de que el scheduler de GitHub Actions se ejecute.
- El control de concurrencia de scrypt es por proceso; en serverless varias instancias pueden derivar en paralelo. El rate limiting atómico por IP es el control efectivo entre instancias.
- La reconciliación implementada es la parte basada en base de datos. El listado masivo del store de Blob requiere credenciales reales y medición de operaciones.
- Con Cache Components, `notFound()` y `redirect()` dentro de una página con streaming se entregan con estado 200 y la instrucción en el payload. Por eso los 404 públicos, las redirecciones 308 y la redirección de `/admin` se deciden en `src/proxy.ts` (D-023 y D-024). Las rutas que dependen de params usan `export const instant = false` para bloquear la respuesta.
- El `loading.tsx` raíz se eliminó: una pantalla de carga en la raíz convertía todos los 404 en 200 porque el shell se transmitía antes de resolver la página. El esqueleto de la portada vive en su propio `<Suspense>`.
- RSS quedó fuera del alcance de lanzamiento (D-024); el sitemap incluye `lastModified` y el detalle emite JSON-LD.

## Decisiones de seguridad y operación

- CSP dual: rutas públicas con `script-src 'self' 'unsafe-inline'` (HTML generado por la app y sanitizado) y `/admin` con nonce por solicitud y `strict-dynamic`. Se emite desde `src/proxy.ts`.
- HSTS solo en producción; `object-src 'none'` y `frame-ancestors 'none'` en ambas políticas.
- Rate limiting de login atómico mediante transacción y `pg_advisory_xact_lock` por IP; la verificación scrypt ocurre dentro del bloqueo.
- Upload con `readLimitedBody` antes de `formData()`: no se confía en `Content-Length`.
- Variables: `drizzle.config.ts` usa `DATABASE_URL_UNPOOLED`; la aplicación usa `DATABASE_URL` con un pool de 2 conexiones por instancia por defecto.
- El proxy usa un pool propio con `max: 1` para decidir los 404 y resolver redirecciones; ante un error de base de datos o presupuesto agotado falla abierto.
- Backups con cliente PostgreSQL 18 o posterior y restauración limitada a localhost y bases `*_test`/`*_testing`; la restauración registra `backup_restored_at`.
- Los scripts `test:db` y `test:http` solo aceptan PostgreSQL en loopback y limitan sus borrados a fixtures propios; el smoke HTTP restaura las filas de `cron_runs` que sobrescriben.
- `requireSession()` no muta cookies por defecto. Solo los contextos que lo permiten (Server Functions y Route Handlers) pasan `clearCookie: true`; en Server Components la cookie caducada únicamente redirige al login.

## Historial de ramas integradas

- `feat/editorial-auth-media-actions`: Server Actions editoriales con sesión, origen, Zod y snapshots transaccionales; login con scrypt asíncrono y rate limit por IP.
- `feat/database-migrations`: baseline SQL con diez tablas, FKs, checks, índices y triggers, registrado en el journal de Drizzle.
- `feat/admin-editorial-panel`: rutas `/admin` protegidas en el layout de servidor, editor y selector de medios; sin gestión de juegos, papelera ni rollback.
- `feat/cron-cleanup`: limpieza de sesiones e intentos, reintento de orphans y registro en `cron_runs`; ahora con retención de 7 días.
- `feat/monitoring` (PR #13): liveness/readiness, métricas y logging estructurado.
