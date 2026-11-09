# Fase 0 — estado de implementación y validación

Este documento separa los cambios de código que pueden prepararse desde el repositorio de las mediciones que requieren despliegue y credenciales reales.

## Implementado en este PR

- El pool de PostgreSQL usa `pg` + Drizzle y registra el pool con `attachDatabasePool` de `@vercel/functions` para el ciclo de vida de Vercel Fluid.
- El pool comienza con `max: 2`, configurable mediante `DATABASE_POOL_MAX`; el valor debe validarse contra el límite de conexiones de Neon y la concurrencia real.
- Se establecen timeouts de conexión e inactividad para acotar recursos por instancia.
- `GET /api/health` es un endpoint de liveness que no importa el módulo de base de datos y no depende de Neon.
- La configuración de `@vercel/functions` queda declarada explícitamente en dependencias.

## No implementado deliberadamente

No se agrega todavía `/resenas/[slug]`: el proyecto no tiene en código `visibleArticle` con el contrato de publicación previsto ni páginas públicas de reseñas. El módulo actual `src/lib/content.ts` expone un predicado y consulta de slugs, pero no se encuentra conectado a una ruta pública. Crear una página real antes de definir el renderizado Markdown sanitizado y el contrato de artículo podría consolidar una API interna equivocada.

Tampoco se implementa la mutación editorial para demostrar `updateTag`: aún no existe la Server Action de publicación.

## Pruebas pendientes de ejecución en entorno desplegado

Estas pruebas no pueden considerarse aprobadas por compilar el repositorio ni por inspección estática:

| Prueba | Evidencia que debe guardarse |
|---|---|
| Región Neon `sa-east-1` y Vercel `gru1` | Configuración real de ambos proyectos |
| Lectura pública sin despertar Neon | CU-h antes/después, separando caché CDN de caché de datos |
| 30 visitas y 50 slugs inexistentes | Logs de requests y métricas CU-h |
| `updateTag` tras mutación | Server Action + lectura inmediata en una prueba de integración |
| Upload multipart real de 2 MB | Respuesta Blob, bytes descargados y hash |
| Validación de imágenes | MIME, magic bytes, dimensiones y límite de megapíxeles |
| Procesamiento Sharp | WebP original y variantes 480/960/1600 verificadas |
| Backup PostgreSQL 17 | `pg_dump` con `DATABASE_URL_UNPOOLED`, `pg_restore --list` y restauración efectiva |
| Scrypt N=2^17 | Latencia p50/p95 y pico de memoria |
| Cache/CDN y operaciones Blob | `x-vercel-cache`, operaciones list/CDN miss y costos |
| Cron | Frecuencia efectiva y costo por ejecución |
| CSP | Hashes/nonce y verificación en navegador |
| Rutas y redirects | 404/308 con Cache Components |

## Criterio de salida

La Fase 0 continúa en **NO-GO** hasta ejecutar y adjuntar evidencia de las pruebas anteriores que afecten la arquitectura. En particular, `x-vercel-cache: HIT` por sí solo no demuestra que una función no haya consultado Neon: debe contrastarse con el consumo de cómputo de Neon.

No se deben publicar secretos, tokens, URLs con credenciales ni dumps con datos personales en los artefactos del repositorio.
