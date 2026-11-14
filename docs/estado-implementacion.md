# Estado real de implementación

Este documento separa el diseño objetivo de las capacidades que existen en el repositorio. Actualizarlo cuando un cambio se integre o una validación se complete.

Última actualización: 14 de noviembre de 2026, sobre la rama de trabajo del endurecimiento previo al lanzamiento (lotes 1 a 4, sin commitear todavía). La base local está en la migración `0004_games_trash_support`; la base de producción en Neon sigue en `0002_reconcile_legacy_schema` y **no se migró todavía**.

La documentación del repositorio (`README.md` y `docs/`) se alineó con el código real: se corrigieron el contrato de API, el modelo de datos, los esquemas de Zod, el flujo de UI, las variables de entorno, el panel, la reconciliación, el despliegue y la política de CSP. Donde el diseño original todavía no está implementado (vista previa de Markdown, autoguardado local, backups cifrados, listado masivo de Blob, `next_due` en Edge Config) el documento lo dice de forma explícita en lugar de presentarlo como existente.

## Código presente y validado localmente

| Área                       | Implementación visible                                                                                                                                                            | Estado de validación                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Framework                  | Next.js 16.4.5 App Router, Cache Components y TypeScript estricto                                                                                                                 | Typecheck y build locales aprobados; CI pendiente de ejecutar sobre el commit final           |
| Dependencias               | Lockfile versionado, `npm ci` reproducible, `overrides` para zod, Dependabot semanal                                                                                              | `npm ci` aprobado; `npm audit --omit=dev` = 0 vulnerabilidades                                |
| Calidad                    | ESLint compuesto (`eslint.config.mjs`), Prettier, Husky con `lint-staged` en pre-commit, `.nvmrc` en Node 24 y `test:all`                                                         | `lint`, `format:check`, `typecheck`, `test` y `build` aprobados localmente                    |
| Base de datos              | Pool pg (`DATABASE_POOL_MAX`, 2 por defecto), Drizzle y migraciones `0000` a `0004`                                                                                               | PostgreSQL 18.6: 12 tablas, 49 índices, 9 claves foráneas, 54 `CHECK`, 5 triggers, 6 rarezas  |
| Puntuación y rareza        | Score 0-100, `score_details` JSONB (`story`, `gameplay`, `visual`, 1-10) y rareza derivada por trigger desde `score_rarities`                                                     | Contrato verificado en BD: 6 bandas, derivación en cada umbral y rechazo de valores inválidos |
| Health / readiness         | `/api/health` liveness sin DB ni Blob; `/api/ready` con DB/Blob y Bearer                                                                                                          | Probados por HTTP contra servidor real                                                        |
| Lectura pública            | Portada, `/juegos` (filtros y azar), `/buscar`, `/terminos`, `/privacidad`, colecciones, artículo por tipo/slug y ficha `/juegos/[slug]`                                          | Build y smoke HTTP aprobados; falta contenido real en producción                              |
| Juegos                     | Catálogo con filtros de plataforma, género y año, paginación y "Juego al azar"; ficha con plataformas, géneros, etiquetas, cuerpo, reseñas publicadas y JSON-LD `VideoGame`       | Rutas y filtros comprobados por HTTP contra PostgreSQL real                                   |
| Artículo                   | Pros y contras, video de YouTube/Vimeo embebido en `youtube-nocookie.com` (otros enlaces se muestran como enlace), galería estructurada y artículos relacionados por etiqueta     | Comprobado por HTTP contra el servidor local                                                  |
| UI migrada del legacy      | Píldoras de navegación, pie de 4 columnas con SVG inline, aside "Historias principales", chips por sección y categoría, badge de rareza, "Nivel de biblioteca" y buscador central | Comprobado por HTTP contra el servidor local (36/36)                                          |
| Panel editorial            | Escritorio con búsqueda, filtros y paginación; alta/edición de artículos y juegos; papelera y restauración; biblioteca de medios; historial de revisiones (20) con restauración   | Rutas y sesión probadas por HTTP; falta revisión manual en navegador                          |
| Visibilidad                | Solo artículos publicados cuya fecha ya llegó; los juegos publicados nunca se filtran por fecha                                                                                   | `cron_runs` con cursor probado vía `/api/revalidate`                                          |
| Markdown                   | React Markdown, GFM, sanitización rehype y resolución de `media:<id>` a Blob con variantes                                                                                        | Tests XSS y de resolución de medios aprobados                                                 |
| SEO                        | Metadata base, Open Graph con imagen propia (`og_media_id`), canonical, robots, sitemap con `lastModified`, JSON-LD `Article` y `VideoGame`                                       | Comprobado por HTTP: idioma, título, viewport, canonical y sitemap presentes                  |
| Accesibilidad              | Skip link, landmarks, foco visible, `aria-current`, contraste, objetivos de 24 px, errores de formulario asociados con `aria-describedby` y aviso a lectores de pantalla          | Comprobado por HTTP; falta revisión manual con lector de pantalla y teclado                   |
| Errores HTTP               | 404 real desde el proxy para rutas, colecciones y artículos inexistentes; 307 de `/admin` sin cookie; 308 de slugs anteriores                                                     | Comprobado por HTTP contra el servidor local (36/36)                                          |
| Validación                 | Esquemas Zod de artículo, juego y medio; `searchParams` normalizado (un parámetro repetido ya no produce un 500) y escape de comodines `LIKE`                                     | Tests aprobados                                                                               |
| Blob e imágenes            | Upload autenticado de 2 MB con límite real de cuerpo, magic bytes, MIME, Sharp, WebP y variantes 480/960/1600                                                                     | Límite de cuerpo y rechazo de origen probados por HTTP; subida real a Blob pendiente          |
| Medios y referencias       | Edición de `alt`, crédito, derechos y origen; marcado para eliminación reversible; detección única de referencias (portada, Open Graph, cuerpo y galería)                         | Probado contra PostgreSQL real                                                                |
| Sesiones                   | login/logout/logoutAll con scrypt asíncrono, token opaco, digest en BD, expiración y rate limit atómico por IP (IPv6 colapsada a /64)                                             | Probado contra PostgreSQL real, incluida concurrencia                                         |
| Server Actions editoriales | Crear, actualizar, publicar, despublicar, enviar a papelera, restaurar y restaurar revisiones, con autorización y validación centralizadas en `src/app/actions/_shared.ts`        | Typecheck/build aprobados; probado el control de origen y sesión vía HTTP                     |
| Ciclo de vida de juegos    | Crear, editar, publicar, despublicar, enviar a papelera y restaurar; despublicar o enviar a papelera se rechaza si el juego tiene reseñas publicadas                              | Probado contra PostgreSQL real (regla de papelera)                                            |
| Cron y limpieza            | GET /api/cron/cleanup con bearer secret, retención de 7 días y reintento acotado de Blob huérfano                                                                                 | Purga de sesiones/intentos probada contra DB real; Blob real pendiente                        |
| Reconciliación             | POST /api/reconcile-storage basado en DB, guarda tras restauración y `lastSuccessAt` solo en ejecuciones limpias                                                                  | Código presente; ejecución con Blob real pendiente                                            |
| Backups                    | Scripts `db:backup` y `db:restore` con validación de destino y marca `backup_restored_at`                                                                                         | Ciclo completo ejecutado antes de agregar la marca; falta repetirlo y comprobar el 409        |
| Scheduler                  | `.github/workflows/scheduled-jobs.yml`: revalidación cada 30 min, limpieza y reconciliación diarias, con `needs: cleanup` y `always()`                                            | Configuración presente; primera ejecución real pendiente de secretos en GitHub                |
| CI                         | `quality.yml` con `npm ci`, Node 24, actions v5, audit, `test:migrations`, `test:baseline` y job de integración con PostgreSQL 18; `codeql.yml`                                   | Pendiente de ejecutar en GitHub sobre el commit final                                         |

## Criterios para declarar algo terminado

- Implementado: el código existe y está conectado a una ruta o flujo real.
- Typecheck aprobado: check de CI completado correctamente.
- Tests aprobados: suite automatizada ejecutada y aprobada.
- Build aprobado: check de build de producción completado correctamente.
- Integración validada: prueba contra un entorno de prueba con dependencias reales.
- Producción validada: comportamiento observado en el deployment real, con evidencia y fecha.

No usar “funciona”, “seguro”, “rápido” o “listo para producción” basándose solo en que un archivo fue agregado.

## Validaciones ejecutadas

Comandos locales (Node 24.22.2, PostgreSQL 18.6 en loopback):

| Comprobación              | Resultado                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `npm ci`                  | Instalación limpia desde el lockfile                                                       |
| `npm audit --omit=dev`    | 0 vulnerabilidades                                                                         |
| `npm test`                | 61 tests aprobados                                                                         |
| `npm run lint`            | 0 errores, 0 warnings                                                                      |
| `npm run format:check`    | Todo el repositorio conforme                                                               |
| `npm run typecheck`       | Aprobado                                                                                   |
| `npm run build`           | Aprobado (Next.js 16.4.5)                                                                  |
| `npm run test:db`         | 11/11 comprobaciones contra PostgreSQL 18.6                                                |
| `npm run test:migrations` | Base nueva y base legacy migradas a `0004`; rareza, subpuntuaciones y papelera verificadas |
| `npm run test:baseline`   | Flujo completo de baseline (esquema legacy → historial → migrate) sobre base desechable    |
| `npm run test:http`       | 36/36 comprobaciones contra el servidor local                                              |
| `npm run db:backup`       | Dump custom generado y validado con `pg_restore --list`                                    |
| `npm run db:restore`      | Restauración completa en base local de prueba                                              |

`test:db` cubre: creación de las doce tablas, constraints y triggers, derivación de la rareza desde el score en todos los umbrales, validación de las subpuntuaciones y del rango de puntuación en la base, validación de origen contra `PUBLIC_SITE_URL`, tokens de sesión (solo se persiste el digest), backoff tras cinco fallos, atomicidad de 10 intentos concurrentes (exactamente 5 permitidos), aceptación de la contraseña correcta con ventana limpia, filtros de catálogo (`arrayContains`), solapamiento de etiquetas (`arrayOverlaps`) y la regla de papelera de juegos. Los fixtures usan identificadores e IPs propios de cada ejecución y cada script exige que `DATABASE_URL` apunte a loopback; una base remota se rechaza aunque su nombre termine en `_test`.

`test:http` cubre: liveness, readiness autenticado con DB real, CSP pública compatible con scripts inline y con `frame-src` para los reproductores de YouTube y Vimeo, CSP de `/admin` con nonce aplicado a las etiquetas `<script>`, 404 real para rutas y slugs inexistentes, redirección permanente 308 de una ruta legacy hacia su artículo actual (con su `Location`), metadatos de Twitter en el artículo (`card`, `title` e `image`), `aria-current` del wordmark en la portada y del enlace de la colección activa, píldoras de navegación con las cuatro secciones, pie de cuatro columnas con contacto y redes, buscador central y "Nivel de biblioteca" en la portada, chips de sección con los cuatro colores, badge de rareza y aside "Historias principales" en una reseña publicada, catálogo filtrado por plataforma, ficha de juego con JSON-LD `VideoGame` y reseñas enlazadas, "Juego al azar" con redirección 307, pros y contras, video embebido en `youtube-nocookie.com`, galería y artículos relacionados, redirección de `/admin` sin sesión, panel accesible con sesión válida, secciones de juegos y medios del panel, idioma y metadatos (título, viewport, canonical), skip link antes de la navegación, un único `h1` e imágenes con `alt`, `robots.txt` y `sitemap.xml`, rechazo de sesión ausente o falsificada, aceptación de sesión válida, autorización del cron, purga de sesiones/intentos, revalidación de publicación programada, rechazo de origen externo en upload, límite real de cuerpo sin `Content-Length` y rechazo de archivos que no son imagen. Las filas de `cron_runs` que sobrescriben los endpoints programados se fotografían antes y se restauran al terminar, en lugar de borrarse.

## Pendientes

1. **Migrar Neon de `0002` a `0004`** con aprobación explícita: `npm run db:migrate` contra la URL directa después de un backup nuevo. Hasta entonces el código del repositorio espera columnas que producción todavía no tiene (`pros`, `cons`, `video_url`, `article_gallery`, `games.tags`, papelera de juegos).
2. Cargar el contenido real. La carga es manual desde el panel: la base es la fuente de verdad (D-003) y no hay importador. La ficha del juego se crea antes que la reseña; `releaseYear` del legacy se mapea al primer día del año.
3. Ejecutar el workflow completo en GitHub sobre el commit final y confirmar que el job de integración deja de fallar por el origen.
4. Configurar `NETTI_SITE_URL` y `CRON_SECRET` en GitHub, ejecutar `workflow_dispatch` y comprobar `cron_runs` para los tres jobs programados.
5. Probar la subida real a Vercel Blob (formatos, EXIF, orientación, variantes, compensación de errores y reconciliación). Requiere credenciales reales.
6. Repetir el ciclo backup → restore con la marca `backup_restored_at` y comprobar que la reconciliación responde `409`.
7. Validar en runtime las redirecciones 308 de slugs anteriores en producción y la resolución de imágenes `media:<id>` con datos reales.
8. Revisar el panel en un navegador real: alta de un juego, galería, video, papelera y restauración de una revisión. La cobertura automática es solo HTTP.
9. Revisar accesibilidad con lector de pantalla, navegación por teclado y zoom al 200 % sobre un deployment real: la revisión automática por HTTP ya está cubierta.
10. Medir el costo del control de 404 del proxy en un deployment real (consultas por minuto y por instancia) y ajustar el presupuesto de confirmaciones si el tráfico de rastreadores lo agota.
11. Añadir vista previa de Markdown en el editor si se considera necesaria (debe reutilizar `MarkdownContent`).
12. Añadir el contador de estadísticas por colección que tenía el legacy.
13. Revisar el texto de `/terminos` y `/privacidad` con la redacción legal definitiva: hoy son textos de trabajo.
14. Decidir el destino del backup automatizado (A-01): almacenamiento externo, cifrado con `age` y rotación. Hoy solo existe el backup manual.

## Advertencias técnicas abiertas

- La política de caché debe validarse con las reglas de Cache Components de la versión instalada y con `x-vercel-cache`; no inferir persistencia compartida entre instancias.
- El contenido Markdown se sanitiza con un esquema de rehype-sanitize que solo agrega el protocolo `media:`. La URL final de una imagen del cuerpo siempre sale de la tabla `media`, nunca del texto Markdown.
- `cacheLife("minutes")` es deliberado: acota el retraso de visibilidad de publicaciones programadas. `/api/revalidate` reduce ese retraso, pero la garantía final depende de que el scheduler de GitHub Actions se ejecute.
- El control de concurrencia de scrypt es por proceso; en serverless varias instancias pueden derivar en paralelo. El rate limiting atómico por IP es el control efectivo entre instancias.
- La reconciliación implementada es la parte basada en base de datos. El listado masivo del store de Blob requiere credenciales reales y medición de operaciones.
- Con Cache Components, `notFound()` y `redirect()` dentro de una página con streaming se entregan con estado 200 y la instrucción en el payload. Por eso los 404 públicos, las redirecciones 308 y la redirección de `/admin` se deciden en `src/proxy.ts` (D-023 y D-024). Las rutas que dependen de params usan `export const instant = false` para bloquear la respuesta.
- El `loading.tsx` raíz se eliminó: una pantalla de carga en la raíz convertía todos los 404 en 200 porque el shell se transmitía antes de resolver la página. El esqueleto de la portada vive en su propio `<Suspense>`.
- RSS quedó fuera del alcance de lanzamiento (D-024); el sitemap incluye `lastModified` y el detalle emite JSON-LD.
- El trigger `articles_set_updated_at` incrementa `version` en cada `UPDATE`. El formulario del panel usa esa versión como control de concurrencia y se resincroniza cuando cambia, de modo que restaurar una revisión no deja el editor con datos viejos.
- `REVISION_RETENTION` vive en `src/lib/revisions.ts` y no en el archivo `'use server'`: un módulo de acciones solo puede exportar funciones asíncronas.

## Decisiones de seguridad y operación

- CSP dual: rutas públicas con `script-src 'self' 'unsafe-inline'` (HTML generado por la app y sanitizado) y `/admin` con nonce por solicitud y `strict-dynamic`. Se emite desde `src/proxy.ts`.
- La CSP pública declara `frame-src https://www.youtube-nocookie.com https://player.vimeo.com`: sin esa directiva, `default-src 'self'` bloqueaba los reproductores de video de las reseñas. El panel no declara `frame-src` y no embebe reproductores.
- HSTS solo en producción; `object-src 'none'` y `frame-ancestors 'none'` en ambas políticas.
- Rate limiting de login atómico mediante transacción y `pg_advisory_xact_lock` por IP; la verificación scrypt ocurre dentro del bloqueo.
- Upload con `readLimitedBody` antes de `formData()`: no se confía en `Content-Length`.
- Variables: `drizzle.config.ts` usa `DATABASE_URL_UNPOOLED`; la aplicación usa `DATABASE_URL` con un pool de 2 conexiones por instancia por defecto.
- El proxy usa un pool propio con `max: 1` para decidir los 404 y resolver redirecciones; ante un error de base de datos o presupuesto agotado falla abierto.
- Backups con cliente PostgreSQL 18 o posterior y restauración limitada a localhost y bases `*_test`/`*_testing`; la restauración registra `backup_restored_at`.
- Los scripts `test:db`, `test:migrations`, `test:baseline` y `test:http` solo aceptan PostgreSQL en loopback y limitan sus borrados a fixtures propios; el smoke HTTP restaura las filas de `cron_runs` que sobrescriben. `test:migrations` y `test:baseline` crean y destruyen sus propias bases desechables.
- La base de producción en Neon se creó fuera de Drizzle, por lo que su historial se registró con `db:baseline` y se reconcilió con la migración `0002_reconcile_legacy_schema` (idempotente). `test:migrations` cubre las dos rutas: base nueva con todas las migraciones y base legacy reconciliada que después recibe `0003` y `0004`.
- `requireSession()` no muta cookies por defecto. Solo los contextos que lo permiten (Server Functions y Route Handlers) pasan `clearCookie: true`; en Server Components la cookie caducada únicamente redirige al login.
- Un error de infraestructura no se confunde con una sesión ausente: `SessionRequiredError` responde 401 y `OriginNotAllowedError` responde 403, mientras que una falla de PostgreSQL se registra y responde 503. El panel y el login solo redirigen ante `SessionRequiredError`.

## Historial de ramas integradas

- `feat/editorial-auth-media-actions`: Server Actions editoriales con sesión, origen, Zod y snapshots transaccionales; login con scrypt asíncrono y rate limit por IP.
- `feat/database-migrations`: baseline SQL de diez tablas, FKs, checks, índices y triggers, registrado en el journal de Drizzle.
- `feat/admin-editorial-panel`: rutas `/admin` protegidas en el layout de servidor, editor y selector de medios.
- `feat/cron-cleanup`: limpieza de sesiones e intentos, reintento de orphans y registro en `cron_runs`; ahora con retención de 7 días.
- `feat/monitoring` (PR #13): liveness/readiness, métricas y logging estructurado.
