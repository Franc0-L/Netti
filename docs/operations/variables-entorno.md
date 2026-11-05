# Variables de entorno

Configurar en Vercel (Producción y Preview) y localmente en un archivo `.env` (no se sube a Git).

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `CONTENT_GITHUB_TOKEN` | Sí | Token de GitHub para acceder al repositorio de contenido (Contenido-Netti) |
| `CONTENT_GITHUB_REPO` | Sí | Nombre del repositorio de contenido (formato `owner/repo`) |
| `ADMIN_PASSWORD` | Sí | Contraseña de acceso al panel editorial |
| `ADMIN_SESSION_SECRET` | Sí | Secreto para firmar las cookies de sesión del panel (mínimo 32 caracteres) |
| `PUBLIC_SITE_URL` | No | URL pública del sitio (usada para el sitemap y URLs canónicas) |
| `RAWG_API_KEY` | No | Clave para enriquecer fichas con RAWG API |
| `ADMIN_LOGIN_GLOBAL_MAX` | No | Límite global de intentos de login (default: 120) |

## Reglas

- Nunca usar el prefijo `PUBLIC_` para secretos (solo `PUBLIC_SITE_URL` es público)
- No subir valores reales a Git (el archivo `.env` está en `.gitignore`)
- En `astro dev`, Astro carga `.env` en `import.meta.env`
- En producción (Vercel), las variables llegan por `process.env`

## Ejemplo `.env`

```env
RAWG_API_KEY=
PUBLIC_SITE_URL=https://netti.vercel.app

CONTENT_GITHUB_REPO=Franc0-L/Contenido-Netti
CONTENT_GITHUB_TOKEN=

ADMIN_SESSION_SECRET=
ADMIN_PASSWORD=

# ADMIN_LOGIN_GLOBAL_MAX=120
```

Copiar de `.env.example` y completar los valores antes de ejecutar `npm run dev`.
