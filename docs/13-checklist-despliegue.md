# Checklist de despliegue — Netti en Vercel Hobby

Este documento lista los pasos y verificaciones previas al despliegue de Netti en Vercel Hobby. Está diseñado para ejecutarse cuando se decida publicar el sitio.

## Antes del despliegue

### 1. Repositorio y código

- [ ] Rama `main` sincronizada con `origin/main`
- [ ] Working tree limpio (`git status` muestra "nothing to commit")
- [ ] `npm run build` pasa sin errores
- [ ] `npm run typecheck` pasa sin errores
- [ ] `npm run lint` pasa sin errores (0 errores, warnings aceptables)
- [ ] `npm run test` pasa (24/24 tests)
- [ ] `drizzle-kit push` ejecutado contra la base de producción de Neon

### 2. Variables de entorno

Configurar en el dashboard de Vercel (Settings → Environment Variables):

| Variable | Valor | Entorno |
|----------|-------|---------|
| `DATABASE_URL` | URL pooled de Neon | Production, Preview, Development |
| `DATABASE_URL_UNPOOLED` | URL directa de Neon | Production, Preview, Development |
| `ADMIN_PASSWORD_HASH` | Hash scrypt generado con `npm run hash:admin` | Production, Preview, Development |
| `BLOB_READ_WRITE_TOKEN` | Token de Vercel Blob | Production, Preview, Development |
| `VERCEL_OIDC_TOKEN` | (opcional) | Production |
| `BLOB_STORE_ID` | ID del store de Blob | Production, Preview, Development |
| `CRON_SECRET` | Secreto de al menos 32 caracteres | Production, Preview, Development |
| `EDGE_CONFIG_ID` | (opcional) | Production |
| `IMAGES_PUBLIC_BASE_URL` | URL pública de imágenes | Production, Preview, Development |
| `PUBLIC_SITE_URL` | `https://tu-proyecto.vercel.app` | Production, Preview, Development |

> ⚠️ No subir `.env.local` ni `.env` al repositorio. Están en `.gitignore`.

### 3. Base de datos Neon

- [ ] Proyecto creado en región `sa-east-1`
- [ ] Base de datos `neondb` con tablas migradas (`drizzle-kit push`)
- [ ] `DATABASE_URL_UNPOOLED` disponible para backups y migraciones
- [ ] Límite de conexiones monitoreado (máximo 3 por instancia)

### 4. Vercel Blob

- [ ] Store de Blob creado en el dashboard de Vercel
- [ ] Token `READ_WRITE_TOKEN` copiado
- [ ] Límite de 5 GB de almacenamiento monitoreado

### 5. Cron

- [ ] Endpoint `/api/cron/cleanup` probado localmente
- [ ] Programar ejecución cada 30 min en Vercel (Settings → Cron Jobs)
- [ ] `CRON_SECRET` configurado en Vercel y en el header de autorización

---

## Despliegue

### Paso 1: Conectar repositorio a Vercel

1. Ingresar a https://vercel.com
2. "Add New Project" → Importar `Franc0-L/Netti`
3. Seleccionar rama `main`
4. Configurar variables de entorno (tabla arriba)
5. Desplegar

### Paso 2: Verificar despliegue

- [ ] Sitio carga en `https://tu-proyecto.vercel.app`
- [ ] `/api/health` devuelve `{"status":"ok"}`
- [ ] `/api/metrics` accesible solo con sesión de administrador
- [ ] `/resenas/[slug]` carga artículos publicados
- [ ] Panel de admin accesible en `/admin/login`

### Paso 3: Activar cron

1. En Vercel dashboard: Settings → Cron Jobs
2. Agregar job: `*/30 * * * *` → `https://tu-proyecto.vercel.app/api/cron/cleanup`
3. Header: `Authorization: Bearer <CRON_SECRET>`
4. Verificar primera ejecución en la tabla `cron_runs` de Neon

---

## Post-despliegue

### Verificaciones iniciales

- [ ] `x-vercel-cache` muestra `HIT` en visitas repetidas a páginas públicas
- [ ] Neon no despierta en visitas repetidas después de caché (verificar CU-h en consola de Neon)
- [ ] Subida de imagen de 2 MB funciona desde el panel de admin
- [ ] Publicación de artículo desde el panel funciona
- [ ] `updateTag` invalida caché tras publicación

### Monitoreo continuo

- [ ] Revisar CU-h de Neon semanalmente (menos de 90 CU-h/mes)
- [ ] Revisar operaciones de Blob en Vercel dashboard
- [ ] Revisar logs de ejecución del cron en Neon (`cron_runs`)
- [ ] Revisar backups mensuales (`scripts/backup-db.ts`)

---

## Rollback

Si algo falla tras el despliegue:

1. En Vercel dashboard: Deployments → seleccionar deployment anterior → "Promote to Production"
2. Verificar que el sitio vuelve a funcionar
3. Investigar el error en el deployment fallido

---

## Documentación relacionada

- `docs/00-vision.md`: visión y reglas del proyecto
- `docs/01.1-stack-basico.md`: stack y decisiones arquitectónicas
- `docs/01.2.1-stack-caché-modelo.md`: caché y publicación
- `docs/02.1-modelo-tablas.md`: esquema SQL completo
- `docs/03-validacion-zod.md`: esquemas de validación
- `docs/08-procedimiento-backup-restore.md`: backups con pg_dump
- `docs/09-variables-entorno.md`: variables de entorno requeridas
- `docs/11-monitoreo-observabilidad.md`: health checks y logging
- `docs/12-estimacion-costos.md`: estimación de costos (este documento complementario)
