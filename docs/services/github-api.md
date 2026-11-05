# Integración con GitHub API

Netti lee y escribe contenido desde un repositorio privado de GitHub (`Contenido-Netti`) usando la API REST de GitHub.

## Cliente GitHub (`src/lib/github-fetch.ts`)

Un único cliente (`githubFetch`) se usa para todas las peticiones a GitHub, tanto en el sitio público como en las funciones serverless del panel de administración.

### Características

- **Autenticación**: Usa `CONTENT_GITHUB_TOKEN` como Bearer token
- **User-Agent**: "Netti" (requerido por GitHub)
- **API Version**: `2022-11-28`
- **Rate limiting**: Reintenta automáticamente ante 429 (rate limit) o 403 con `x-ratelimit-remaining: 0`, usando el encabezado `Retry-After` o backoff exponencial
- **Errores 4xx**: No se reintentan (404, 401, 403, 409, 422)
- **Caché**: Las lecturas públicas se cachean en memoria por 60 segundos con deduplicación de llamadas concurrentes

## Endpoints usados

| Operación | Endpoint GitHub | Uso |
|-----------|-----------------|-----|
| Listar árbol | `GET /repos/{repo}/git/trees/main?recursive=1` | Encontrar archivos `.md` de una colección |
| Leer archivo | `GET /repos/{repo}/contents/{path}` | Leer frontmatter y cuerpo de un artículo |
| Leer blob | `GET /repos/{repo}/git/blobs/{sha}` | Leer contenido decodificado de un archivo |
| Escribir archivo | `PUT /repos/{repo}/contents/{path}` | Crear o editar un artículo |
| Eliminar archivo | `DELETE /repos/{repo}/contents/{path}` | Eliminar un artículo (con `sha` para control de versiones) |

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `CONTENT_GITHUB_TOKEN` | Sí | Token de GitHub con acceso al repositorio de contenido |
| `CONTENT_GITHUB_REPO` | Sí | Formato `owner/repo` (ej. `Franc0-L/Contenido-Netti`) |

## Endpoint de medios (`/media/[...path]`)

Descarga imágenes del repositorio privado y las sirve desde el dominio del sitio, evitando exponer `raw.githubusercontent.com` (que no funciona con repositorios privados).

- Valida magic bytes para confirmar que el archivo es una imagen
- Máximo 6 MB por archivo
- Caché en memoria: 5 minutos, 80 entradas máximas
