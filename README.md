# Netti

Netti es una publicación independiente de videojuegos en español. El sitio organiza el contenido en reseñas, noticias y guías; el contenido editorial se almacena en PostgreSQL y las imágenes públicas en Vercel Blob.

## Stack

- Next.js 16 (App Router y Cache Components).
- React 19 y TypeScript estricto.
- PostgreSQL en Neon, consultado con pg y Drizzle ORM.
- Vercel Blob para imágenes.
- Zod para validar entradas.
- React Markdown + remark-gfm + rehype-sanitize para renderizar contenido Markdown sin habilitar HTML arbitrario.

## Requisitos

- Node.js 22.
- npm.
- Variables locales configuradas a partir de .env.example.

## Desarrollo

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.

## Comandos

| Comando | Uso |
| --- | --- |
| npm run dev | Servidor local |
| npm run typecheck | Verificación TypeScript sin emitir archivos |
| npm test | Tests unitarios de utilidades, rutas y validación |
| npm run build | Build de producción |
| npm run start | Servir el build generado |

## Variables de entorno

Copiá .env.example a .env.local y reemplazá todos los valores de ejemplo. No subas secretos al repositorio.

- DATABASE_URL: conexión PostgreSQL usada por la aplicación.
- DATABASE_URL_UNPOOLED: conexión directa para operaciones administrativas y herramientas.
- ADMIN_PASSWORD_HASH: hash scrypt del acceso editorial; nunca una contraseña en texto plano.
- BLOB_READ_WRITE_TOKEN: token del store de Vercel Blob.
- CRON_SECRET: secreto aleatorio para endpoints de tareas programadas.
- PUBLIC_SITE_URL: URL canónica pública, requerida en producción.
- DATABASE_POOL_MAX: conexiones máximas por instancia (1–10; predeterminado 2).

## Estructura actual

```
src/
  app/                 Rutas públicas, metadata y Route Handlers
  components/          Componentes de presentación
  db/                  Pool PostgreSQL, Drizzle y esquema
  lib/                 Acceso editorial, autenticación, validación y utilidades
  proxy.ts              Punto de entrada de proxy de Next.js
docs/                  Arquitectura, decisiones y estado de implementación
.github/workflows/     Controles automáticos de CI
```

## Rutas públicas

- /: portada editorial.
- /resenas, /noticias, /guias: colecciones publicadas.
- /{coleccion}/{slug}: artículo individual.
- /api/health: liveness independiente de Neon y Blob.
- /robots.txt y /sitemap.xml: política de rastreo y sitemap de contenido visible.

Los artículos programados no son visibles hasta su fecha de publicación. Las consultas públicas aplican el predicado común de visibilidad.

## Calidad y CI

Cada pull request ejecuta tests unitarios, typecheck y build de producción mediante GitHub Actions. El resultado de esos checks, no la mera existencia del workflow, es la evidencia de que una revisión pasó.

El lockfile debe mantenerse sincronizado con package.json. Hasta que el lockfile refleje todas las dependencias, el workflow resuelve dependencias con npm install; no se considera una instalación reproducible equivalente a npm ci.

## Estado de implementación

La arquitectura documentada contiene funcionalidades que todavía no están implementadas. Consultá [docs/estado-implementacion.md](docs/estado-implementacion.md) antes de asumir que una capacidad existe o está validada. Los resultados de build, despliegue, pruebas con Neon/Blob y mediciones de costos deben registrarse solo después de ejecutarlos.
