# Despliegue en Vercel

Netti está configurado para desplegarse en Vercel usando el adaptador oficial `@astrojs/vercel`.

## Configuración (`vercel.json`)

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- `cleanUrls`: `true`
- Cabeceras de seguridad globales (CSP, HSTS, Referrer-Policy, etc.)
- Cabeceras específicas para `/admin/*` (X-Frame-Options: DENY)
- Cabeceras específicas para `/api/*` (Cache-Control: no-store)

## Pasos para desplegar

1. Conectar el repositorio de GitHub a Vercel
2. Configurar las variables de entorno en la consola de Vercel:
   - `CONTENT_GITHUB_TOKEN`
   - `CONTENT_GITHUB_REPO`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
   - `PUBLIC_SITE_URL` (opcional)
   - `RAWG_API_KEY` (opcional)
3. Desplegar. Vercel ejecutará `npm run build` y publicará el sitio

## Notas

- Las funciones serverless de Vercel manejan las rutas `/api/admin/*` (login, contenido, subida de medios)
- El endpoint `/media/[...path]` también es una función serverless
- El middleware de caché se ejecuta en el edge de Vercel
