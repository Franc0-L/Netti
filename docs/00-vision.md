# Documentación Maestra — Netti

Plan de reconstrucción de Netti. Es la referencia para cualquier persona o agente que trabaje en el proyecto.

## Qué hay aquí

| Archivo                       | Qué explica                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `00-vision.md`                | Visión, alcance, reglas e índice                                                              |
| `01-stack-arquitectura.md`    | Stack, Next.js 16, Neon, caché, imágenes, auth, Markdown, seguridad, decisiones D-001 a D-022 |
| `02-modelo-datos.md`          | Esquema SQL: tipos, juegos, articles, media, sesiones, búsquedas                              |
| `03-validacion-zod.md`        | makeArticleSchema, makeGameSchema, makeMediaMetadataSchema                                    |
| `04-api-endpoints.md`         | Server Actions y Route Handlers: auth, contenido, upload, health, headers                     |
| `05-ui-flujo.md`              | Paleta, panel, flujo editorial                                                                |
| `06-operaciones.md`           | Git, entorno, variables, migraciones, backups, despliegue                                     |
| `07-reconciliacion-y-cron.md` | Contrato Storage, reconciliación de Blob, cursor del cron                                     |

## Qué es Netti

Blog editorial de videojuegos en español, de un solo autor, con reseñas (puntuación 1–10), noticias, guías y fichas de juegos. Tiene un sitio público de lectura y un panel editorial propio a pantalla completa. No usa CMS externo.

## Cómo usar estos documentos

1. Para entender el contexto y el stack: `01-stack-arquitectura.md`.
2. Para modelar datos: `02-modelo-datos.md`.
3. Para validación: `03-validacion-zod.md`.
4. Para escribir Server Actions o endpoints: `04-api-endpoints.md`.
5. Para construir interfaz: `05-ui-flujo.md`.
6. Para configurar el repo y desplegar: `06-operaciones.md`.
7. Para empezar a programar: `06-operaciones.md` y `07-reconciliacion-y-cron.md`, **Fase 0**.

## Reglas

- **La mejor herramienta gana**, aunque obligue a rehacer algo. No se defiende una decisión por haberla tomado antes.
- **Un solo repositorio.** El contenido vive en Postgres, no en archivos.
- **La lectura pública no despierta la base.** Es un **objetivo de Fase 0**, no una garantía ya probada: `use cache` no asegura persistencia compartida entre instancias serverless. Se verifica con `x-vercel-cache` y consumo de CU-h antes de considerar la arquitectura lista para producción.
- **La base impone lo que puede imponer.** `CHECK`, índices parciales y claves foráneas, además de Zod.
- **Backups obligatorios** desde la Fase 3, con restauración probada.
- **Morado** (`#b79aff`, `#d1bdff`) en sitio y panel. Decisión cerrada: no se cambia.
- **Panel a pantalla completa**, vista previa como acción aparte.
- **Decisiones difíciles de revertir**: un ADR corto en el momento. El resto se decide programando; no se documenta antes de existir.

## Cómo se lee una decisión

Cada afirmación de infraestructura lleva su grado de certeza. Sin esto, una hipótesis termina tratada como propiedad confirmada.

| Estado                    | Significado                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- |
| **Decidida**              | Se eligió y no se reabre sin un argumento nuevo.                                |
| **Validación: pendiente** | Depende de un comportamiento que todavía no se midió. Se confirma en la Fase 0. |
| **Diferida**              | Se sabe que hace falta, pero no en la primera versión.                          |
| **Descartada**            | Se evaluó y se rechazó, con el motivo escrito.                                  |

## Decisiones y validaciones pendientes

| #   | Decisión                                                                                                                                                           | Estado                             | Qué se valida en Fase 0                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | **Vercel Blob + subida por servidor.** `lib/storage.ts` aísla `put`/`del` para poder migrar si algún día se justifica.                                             | Decidida                           | Subida real de 2 MB, cuatro objetos, compensación si falla `INSERT` en media.                                          |
| 2   | **`scrypt` con N=2^17 en Vercel.** Consume ~128 MiB por verificación. Si el spike muestra problemas de memoria o latencia, se baja N con un ADR que lo justifique. | Decidida con validación pendiente  | Latencia p50/p95, memoria máxima, concurrencia de verificaciones.                                                      |
| 3   | **Cron de revalidación.** GitHub Actions cada 30 minutos (`scheduled-jobs.yml`); Vercel Schedules cuando salga de beta con condiciones aceptables.                 | Implementada, validación pendiente | Endpoint idempotente, `last_success_at`, retraso acotado, medición de CU-h por despertar (Fase 0).                     |
| 4   | **Caché pública con `"use cache"` + `cacheLife("minutes")` e invalidación on-demand.**                                                                             | Implementada, validación pendiente | Lectura sin consultas a Neon en visitas repetidas dentro de la ventana de caché; la caché es local, no remota.         |
| 5   | **CSP con `'unsafe-inline'` en lo público y nonces en `/admin`.** El HTML público lo genera la aplicación y se sanitiza.                                           | Implementada                       | Revisar si los scripts inline de Next.js admiten hashes estáticos; si es viable, migrar sin costo de renderizado.      |
| 6   | **Códigos 404 y 308 reales con `cacheComponents: true`.**                                                                                                          | Implementada                       | 404, 308 y 307 se deciden en `src/proxy.ts`; las rutas con params usan `export const instant = false`.                 |
| 7   | **Lecturas de Blob: ¿operaciones simples o avanzadas?**                                                                                                            | Validación: pendiente              | Confirmar si `list` y las lecturas con CDN miss cuentan como operaciones simples (10.000/mes) o avanzadas (2.000/mes). |

## Estado

El repositorio ya contiene una primera base ejecutable: infraestructura inicial, health check, utilidades de sesión, controles de CI en construcción y, en la rama de trabajo actual, la primera experiencia pública editorial. Eso no significa que el producto esté terminado ni que la arquitectura haya superado el spike.

El estado verificable de cada módulo, las pruebas existentes y las validaciones pendientes se mantiene en [docs/estado-implementacion.md](estado-implementacion.md). No se deben presentar decisiones de arquitectura o funcionalidades planeadas como capacidades operativas.

**Siguiente prioridad**: hacer pasar tests, typecheck y build; sincronizar el lockfile; y después completar autenticación/admin, upload, migraciones y cron. La validación real de Neon, caché, scrypt, Blob, CSP y backups sigue siendo requisito para cambiar el estado NO-GO de Fase 0.
