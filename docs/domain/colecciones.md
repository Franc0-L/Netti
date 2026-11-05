# Colecciones de contenido

El contenido editorial se organiza en cuatro colecciones, cada una almacenada como archivos `.md` en el repositorio privado `Contenido-Netti` bajo la carpeta `content/{coleccion}/`.

## Estructura de archivos

```
content/
├── games/          ├── {slug}.md
├── reviews/        ├── {slug}.md
├── news/           ├── {slug}.md
└── guides/         └── {slug}.md
```

Cada archivo `.md` tiene un frontmatter YAML seguido del cuerpo en Markdown:

```md
---
title: "Título del artículo"
description: "Descripción corta"
publishedAt: 2024-01-15
# ... más campos según la colección
---

Cuerpo del artículo en Markdown...
```

## Colecciones

| Colección | Ruta | Descripción |
|-----------|------|-------------|
| **games** | `content/games/` | Fichas de videojuegos (título, año, plataformas, géneros, desarrollador, etc.) |
| **reviews** | `content/reviews/` | Reseñas con puntuación (1-100), pros/tras, veredicto, referencia a un juego |
| **news** | `content/news/` | Noticias con categoría, autor, fuente opcional |
| **guides** | `content/guides/` | Guías prácticas, opcionalmente relacionadas a un juego |

## Slug

El nombre del archivo (sin extensión `.md`) se usa como slug. Debe seguir el patrón: `^[a-z0-9]+(?:-[a-z0-9]+)*$` (minúsculas, números y guiones).

## Campos compartidos

Todas las colecciones comparten campos de imagen y media:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `coverImage` | string | Ruta de la portada (debe empezar con `/media/` o `/images/`) |
| `coverAlt` | string | Texto alternativo de la portada (obligatorio si hay coverImage) |
| `heroImage` | string | Ruta de la imagen panorámica |
| `heroAlt` | string | Texto alternativo de la imagen panorámica (obligatorio si hay heroImage) |
| `videoUrl` | string | URL de YouTube, Vimeo o archivo de video local |
| `videoTitle` | string | Título del video |
| `gallery` | array | Lista de imágenes con `src`, `alt` y `caption` opcional |
