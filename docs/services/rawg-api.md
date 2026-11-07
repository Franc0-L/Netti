# Integración con RAWG API

RAWG se usa para enriquecer las fichas de juegos con datos complementarios (puntuación, fecha de lanzamiento, Metacritic, plataformas).

## Cliente RAWG (`src/lib/rawg.ts`)

La función `getRawgGame(title)` consulta la API de RAWG y devuelve datos complementarios de un juego. Si no hay API key configurada o la petición falla, devuelve `null` silenciosamente — el sitio funciona normalmente sin RAWG.

## Datos obtenidos

| Campo | Descripción |
|-------|-------------|
| title | Nombre del juego |
| released | Fecha de lanzamiento |
| rating | Puntuación de RAWG (0-5) |
| metacritic | Puntuación de Metacritic (0-100) |
| platforms | Lista de plataformas |
| url | Enlace a la ficha en rawg.io |

## Variable de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `RAWG_API_KEY` | No | Clave de API de RAWG (opcional, solo para enriquecimiento) |

## Comportamiento ante fallos

- Si no hay `RAWG_API_KEY`: devuelve `null`
- Si la API responde error: devuelve `null`
- Si no hay resultados: devuelve `null`
- Cualquier error de red: devuelve `null` (no bloquea el renderizado de la página)
