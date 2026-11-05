# Contrato editorial (schemas Zod)

El archivo `src/lib/editorial-contract.ts` es la **fuente de verdad** para validar el frontmatter y el cuerpo de las publicaciones. Los mismos schemas se usan tanto para leer contenido del sitio público como para escribir desde el panel editorial.

## Esquemas por colección

### Games
| Campo | Tipo | Reglas |
|-------|------|--------|
| title | string | 1-200 caracteres, requerido |
| description | string | 1-500 caracteres, requerido |
| releaseYear | number | Entero, 1970-2100, requerido |
| platforms | string[] | 1-20 items, 1-60 caracteres cada uno, requerido |
| genres | string[] | 1-20 items, 1-60 caracteres cada uno, requerido |
| developer | string | 1-120 caracteres, requerido |
| publisher | string | 1-120 caracteres, opcional |
| featured | boolean | default: false |
| tags | string[] | Máximo 12, valores del catálogo editorial |

### Reviews
| Campo | Tipo | Reglas |
|-------|------|--------|
| title | string | 1-200 caracteres, requerido |
| description | string | 1-500 caracteres, requerido |
| game | string | Slug válido que referencia a un juego existente, requerido |
| publishedAt | date | Formato AAAA-MM-DD, requerido |
| score | number | Entero, 1-100, requerido |
| scoreReason | string | 10-1000 caracteres, requerido |
| verdict | string | 1-500 caracteres, requerido |
| author | string | 1-120 caracteres, default: "Redacción" |
| featured | boolean | default: false |
| pros | string[] | Máximo 5 items, 1-200 caracteres cada uno |
| cons | string[] | Máximo 5 items, 1-200 caracteres cada uno |
| scoreDetails | object | story, gameplay, visual (enteros 1-10, al menos uno definido) |

### News
| Campo | Tipo | Reglas |
|-------|------|--------|
| title | string | 1-200 caracteres, requerido |
| description | string | 1-500 caracteres, requerido |
| publishedAt | date | Formato AAAA-MM-DD, requerido |
| category | string | 1-80 caracteres, default: "Noticias" |
| author | string | 1-120 caracteres, default: "Netti" |
| featured | boolean | default: false |
| sourceName | string | 1-120 caracteres, opcional |
| sourceUrl | string | URL válida, opcional |

### Guides
| Campo | Tipo | Reglas |
|-------|------|--------|
| title | string | 1-200 caracteres, requerido |
| description | string | 1-500 caracteres, requerido |
| game | string | Slug válido que referencia a un juego, opcional |
| publishedAt | date | Formato AAAA-MM-DD, requerido |
| author | string | 1-120 caracteres, default: "Redacción" |
| featured | boolean | default: false |

## Etiquetas editoriales

Los valores permitidos para `tags` son:

- "En análisis", "Actualizado", "Rejugado", "Recomendado", "Joyita", "Imprescindible"
- "Cooperativo", "Para jugar en cooperativo", "Multijugador", "Un jugador"
- "Indie", "AAA", "Acceso anticipado"

Máximo 12 etiquetas por artículo, sin repeticiones.

## Texto alternativo de imágenes

Si se define `coverImage` o `heroImage`, es obligatorio definir también `coverAlt` o `heroAlt` respectivamente.
