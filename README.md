# Netti

Netti es una publicación independiente de videojuegos en español. El sitio organiza el contenido en reseñas, noticias y guías; el contenido editorial se almacena en PostgreSQL y las imágenes públicas en Vercel Blob.

## Stack

- Next.js 16 (App Router y Cache Components).
- React 19 y TypeScript estricto.
- PostgreSQL 18 en Neon, consultado con pg y Drizzle ORM.
- Vercel Blob para imágenes.
- Zod para validar entradas.
- React Markdown + remark-gfm + rehype-sanitize para renderizar contenido Markdown sin habilitar HTML arbitrario.

## Requisitos

- Node.js 24.
- npm (instalación reproducible con el lockfile).
- Variables locales configuradas a partir de .env.example.
- PostgreSQL 18 o posterior si vas a ejecutar migraciones, backups o las pruebas de integración.

## Desarrollo

```bash
npm ci
npm run dev
```

Abrí http://localhost:3000.

## Comandos

| Comando              | Uso                                                                      |
| -------------------- | ------------------------------------------------------------------------ |
| npm run dev          | Servidor local                                                           |
| npm run lint         | ESLint sin warnings                                                      |
| npm run format       | Prettier sobre todo el repositorio                                       |
| npm run format:check | Verificación de formato                                                  |
| npm run typecheck    | Verificación TypeScript sin emitir archivos                              |
| npm test             | Tests unitarios de utilidades, rutas y validación                        |
| npm run build        | Build de producción                                                      |
| npm run start        | Servir el build generado                                                 |
| npm run test:db      | Integración de auth, sesiones y rate limiting contra PostgreSQL real     |
| npm run test:http    | Smoke HTTP contra el servidor en ejecución (CSP, sesiones, cron, upload) |
| npm run db:migrate   | Aplicar migraciones con `DATABASE_URL_UNPOOLED`                          |
| npm run db:backup    | Dump custom de PostgreSQL                                                |
| npm run db:restore   | Restaurar un dump en una base local de prueba                            |
| npm run hash:admin   | Generar el hash scrypt de la contraseña administrativa                   |

`npm run test:db` y `npm run test:http` solo se ejecutan contra una base local o cuyo nombre termine en `_test`/`_testing`: borran sesiones e intentos de login mientras ejercitan los flujos.

## Variables de entorno

Copiá .env.example a .env.local y reemplazá todos los valores de ejemplo. No subas secretos al repositorio.

- DATABASE_URL: conexión PostgreSQL usada por la aplicación (pooled en Neon).
- DATABASE_URL_UNPOOLED: conexión directa para migraciones, `pg_dump` y las pruebas de integración.
- ADMIN_PASSWORD_HASH: hash scrypt del acceso editorial; nunca una contraseña en texto plano.
- BLOB_READ_WRITE_TOKEN: token del store de Vercel Blob.
- CRON_SECRET: secreto aleatorio (mínimo 32 caracteres) para endpoints de tareas programadas y `/api/ready`.
- PUBLIC_SITE_URL: URL canónica pública, requerida en producción.
- DATABASE_POOL_MAX: conexiones máximas por instancia (1–10; predeterminado 2).

## Estructura actual

```
src/
  app/                 Rutas públicas, metadata y Route Handlers
  components/          Componentes de presentación
  db/                  Pool PostgreSQL, Drizzle y esquema
  lib/                 Acceso editorial, autenticación, validación y utilidades
  proxy.ts              Punto de entrada de proxy de Next.js y CSP
scripts/               Migraciones auxiliares, backup/restore e integración
docs/                  Arquitectura, decisiones y estado de implementación
.github/workflows/     Controles automáticos de CI
```

## Rutas públicas y operativas

- /: portada editorial.
- /resenas, /noticias, /guias: colecciones publicadas.
- /{coleccion}/{slug}: artículo individual.
- /admin: panel editorial protegido con sesión.
- /api/health: liveness que no toca Neon ni Blob.
- /api/ready: readiness de PostgreSQL y Blob; requiere `Authorization: Bearer $CRON_SECRET`.
- /api/revalidate: activa publicaciones programadas e invalida tags; requiere `CRON_SECRET`.
- /api/reconcile-storage: reconciliación basada en base de datos; requiere `CRON_SECRET`.
- /api/cron/cleanup: purga sesiones e intentos vencidos; requiere `CRON_SECRET`.
- /robots.txt y /sitemap.xml: política de rastreo y sitemap de contenido visible.

Los artículos programados no son visibles hasta su fecha de publicación. Las consultas públicas aplican el predicado común de visibilidad.

Las rutas inexistentes responden con un 404 real: el proxy decide antes de renderizar (con Cache Components, `notFound()` dentro de una página con streaming solo puede entregar un 200). `/admin` sin cookie de sesión responde 307 hacia `/admin/login`.

## Calidad y CI

`.github/workflows/quality.yml` usa Node 24 y `npm ci` (lockfile obligatorio) y se ejecuta en cada push a `main` y en cada pull request:

1. **validate**: tests unitarios, ESLint, Prettier (`--check` sobre todo el repo), typecheck, build de producción y `npm audit --omit=dev --audit-level=high`.
2. **integration**: servicio `postgres:18`, `npm run db:migrate`, build, `npm run test:db` y `npm run test:http` contra el servidor real.

El smoke HTTP cubre también CSP, errores HTTP (404 y redirecciones del panel), metadatos y una base de accesibilidad (skip link, landmarks, un único `h1`, imágenes con `alt`).

El resultado de esos checks, no la mera existencia del workflow, es la evidencia de que una revisión pasó.

## Estado de implementación

La arquitectura documentada contiene funcionalidades que todavía no están implementadas o no se validaron contra servicios reales. Consultá [docs/estado-implementacion.md](docs/estado-implementacion.md) antes de asumir que una capacidad existe o está validada. Los resultados de build, despliegue, pruebas con Neon/Blob y mediciones de costos deben registrarse solo después de ejecutarlos.
