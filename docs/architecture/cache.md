# Capa de caché

Netti tiene dos capas de caché independientes:

## 1. Caché en memoria del servidor (`fetch-content.ts`)

| Parámetro | Valor |
|-----------|-------|
| TTL | 60 segundos |
| Máximo de entradas | 200 |
| Evicción | FIFO (el más antiguo se borra al llenarse) |
| Deduplicación | Sí, llamadas concurrentes al mismo path |

Esta caché evita llamar a GitHub múltiples veces por la misma página dentro de un minuto.

## 2. Caché HTTP del middleware (`middleware.ts`)

| Tipo de respuesta | Cabecera Cache-Control |
|-------------------|------------------------|
| HTML / JSON (200) | `public, max-age=0, s-maxage=60, stale-while-revalidate=300` |
| HTML / JSON (no 200) | Sin cambios |
| `/admin/*` | Sin caché |
| `/api/*` | Sin caché |
| `/media/*` | Sin caché (el endpoint propio maneja su caché) |

El CDN de Vercel respeta `s-maxage=60`, manteniendo el HTML en caché por instancia durante 1 minuto.

## 3. Caché de medios (`/media/[...path].ts`)

| Parámetro | Valor |
|-----------|-------|
| TTL | 5 minutos (300 segundos) |
| Máximo de entradas | 80 |
| Cabecera de respuesta | `public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400` |

Las imágenes se cachean agresivamente en el navegador/CDN porque no cambian con frecuencia.

## Invalidación

No hay invalidación automática entre instancias (serverless). Si publicas contenido nuevo, tarda hasta 60 segundos en reflejarse en el sitio público debido al TTL de la caché en memoria y el s-maxage del middleware.
