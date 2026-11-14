# Operaciones: Git, Entorno y Despliegue — Netti

## 1. Git

| Rama                         | Uso                        |
| ---------------------------- | -------------------------- |
| `main`                       | Producción                 |
| `feat/*`, `fix/*`, `chore/*` | Cambios cortos con preview |

El contenido no toca Git: vive en Postgres y se escribe desde el panel. No hay rama de contenido.

**Previews**: cada PR usa un **proyecto de Neon separado**, no una rama del proyecto de producción. Las ramas comparten las 100 CU-horas y el tope de 10; el PR número 11 fallaría. Un segundo proyecto Free (hay 100) evita compartir cuota y evita que un preview con migraciones rompa producción.

**CI** en cada PR y en `main` (`.github/workflows/quality.yml`):

```bash
npm ci
npm test                 # node:test sobre src/lib y src/components
npm run lint             # eslint .
npm run format:check     # prettier --check .
npm run typecheck        # tsc --noEmit
npm run build

# trabajo de integración, con PostgreSQL 18 como servicio
npm run test:migrations  # base nueva + base legacy reconciliada
npm run test:baseline    # esquema legacy → historial → migrate
npm run db:migrate
npm run test:db
npm run test:http        # contra next start en 127.0.0.1
```

`next build` ya no corre ESLint: si no se agrega `npm run lint`, un error de lint llega a producción. `npm run test:all` encadena las cuatro suites de integración locales; no se usa en CI porque cada job necesita su propia base y su propio servidor.

Además del workflow de calidad, `codeql.yml` analiza el código en cada PR y una vez por semana, y `dependabot.yml` abre PRs semanales de npm y de las GitHub Actions. `.husky/pre-commit` formatea y linta solo los archivos tocados (`lint-staged`).

## 2. Entorno

### 2.1 Servicios y costo real

| Componente    | Servicio                                | Costo                             |
| ------------- | --------------------------------------- | --------------------------------- |
| Base de datos | Neon Free                               | $0                                |
| Imágenes      | Vercel Blob                             | $0 en Hobby dentro de los límites |
| Hosting       | Vercel Hobby                            | $0, solo uso no comercial         |
| CI            | GitHub Actions                          | $0 en repo público                |
| Monitoreo     | Servicio de uptime + tracker de errores | $0 en planes gratuitos            |

**El "costo cero" es real en el plan Hobby.** Solo hay que respetar los límites de Blob:

| Recurso               | Incluido   | Consecuencia de excederlo    |
| --------------------- | ---------- | ---------------------------- |
| Storage               | 1 GB       | Blob deja de estar accesible |
| Transferencia         | 10 GB/mes  | Blob deja de estar accesible |
| Operaciones simples   | 10.000/mes | Blob deja de estar accesible |
| Operaciones avanzadas | 2.000/mes  | Blob deja de estar accesible |

No hay factura sorpresa: **no se cobra el exceso, se bloquea el almacenamiento hasta 30 días** y hay que esperar el ciclo. El límite más ajustado son las operaciones avanzadas: subir una imagen con tres variantes son cuatro `put` (cuatro operaciones). Da para ~500 imágenes nuevas al mes, muy por encima de un blog de un autor. Se mide y se evita resubir la misma imagen.

**Vercel Hobby es no comercial.** Publicidad o afiliados obligan a Pro o a mover el hosting a Cloudflare Pages.

### 2.2 Variables

| Variable                 | Requerida | Descripción                                                                                              |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Sí        | Cadena **pooled** de Neon, para la aplicación                                                            |
| `DATABASE_URL_UNPOOLED`  | Sí        | Cadena directa, para migraciones y `pg_dump`                                                             |
| `ADMIN_PASSWORD_HASH`    | Sí        | `scrypt:131072:8:1:<saltB64>:<hashB64>`                                                                  |
| `CRON_SECRET`            | Sí        | Bearer de los endpoints de cron, revalidación y reconciliación; mínimo 32 caracteres                     |
| `IP_HASH_SECRET`         | No        | Secreto del HMAC que hashea IPs; si falta se usa `CRON_SECRET`                                           |
| `PUBLIC_SITE_URL`        | Sí        | Origen de producción; obligatoria con `NODE_ENV=production` y la usa `assertSameOrigin`                  |
| `IMAGES_PUBLIC_BASE_URL` | No        | URL pública de Blob si no es la del store por defecto (`https://<store>.public.blob.vercel-storage.com`) |
| `BLOB_READ_WRITE_TOKEN`  | No        | Token de lectura/escritura para desarrollo local y CI; en Vercel se resuelve con OIDC                    |
| `BLOB_STORE_ID`          | No        | ID del store de Vercel Blob; OIDC en Vercel suele proveerlo                                              |
| `VERCEL_OIDC_TOKEN`      | No        | Lo inyecta Vercel; no se define a mano                                                                   |
| `EDGE_CONFIG_ID`         | No        | Reservada para `next_due`; el código todavía no la usa                                                   |

`src/lib/env.ts` valida estas variables al arrancar con Zod y falla con un mensaje claro si falta una requerida. `AGE_PUBLIC_KEY` no está implementada: el backup manual se guarda sin cifrar y el cifrado es la decisión pendiente A-01.

**Custodia de la clave `age`** (cuando se implemente A-01): la clave pública cifra el dump en el job de backup; la privada se conserva fuera del repo y de GitHub Actions, y se usa solo para la restauración mensual de prueba. Si se pierde, el backup cifrado no se puede recuperar.

**El separador del hash es `:`, no `$`.** Next expande `$VAR` en los archivos `.env`; un hash con `$` queda corrupto y el login falla sin explicación.

**Previews**: `PUBLIC_SITE_URL` es fija, así que el panel en un preview rechazaría el login con `403`. Mientras no exista una allowlist de previews, la revisión del panel se hace contra el deployment de producción o contra `next start` en local. `PREVIEW_ORIGIN_REGEX` figuraba en el diseño pero no está implementada.

**Dos URLs de base**: el pooler no sirve para migraciones ni para `pg_dump`, y `CREATE INDEX CONCURRENTLY` falla a través de él.

### 2.3 `.env` local

```env
DATABASE_URL=postgresql://postgres:8814@localhost:5432/netti_dev
DATABASE_URL_UNPOOLED=postgresql://postgres:8814@localhost:5432/netti_dev

ADMIN_PASSWORD_HASH=scrypt:131072:8:1:
CRON_SECRET=
IP_HASH_SECRET=

PUBLIC_SITE_URL=http://localhost:3000
IMAGES_PUBLIC_BASE_URL=https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com

BLOB_READ_WRITE_TOKEN=
```

`.env.local` apunta a Neon y nunca se usa para `npm run test:db`, `test:migrations`, `test:baseline` ni `test:http`: esos scripts exigen PostgreSQL en loopback y una base con "test" en el nombre cuando purgan datos. Los secretos de producción viven en Vercel y en los secretos de GitHub (`NETTI_SITE_URL` y `CRON_SECRET` para el scheduler), no en el repositorio.

Generar el hash:

```bash
node -e "
const c = require('crypto');
const p = process.argv[1];
const s = c.randomBytes(16);
c.scrypt(p, s, 64, { N: 2**17, r: 8, p: 1, maxmem: 256*1024*1024 }, (err, h) => {
  if (err) throw err;
  console.log(['scrypt', 2**17, 8, 1, s.toString('base64'), h.toString('base64')].join(':'));
});
" "tu-contraseña"
```

`scryptSync` se evita a propósito: bloquea el event loop y consume CPU activa. N=2^17 necesita `maxmem` explícito; sin él, Node falla con `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`.

El formato del hash debe coincidir **exactamente** entre lo que genera este comando y lo que parsea `lib/auth.ts`: `scrypt:<N>:<r>:<p>:<saltB64>:<hashB64>`. El primer número es el N real (131072), no el exponente (17) ni el valor por defecto de Node (16384).

### 2.3.1 Versión exacta de las dependencias

- `next` se fija **sin rango**: `"next": "16.4.5"`, no `"^16.4.5"`. Un despliegue tiene que ser reproducible.
- `package-lock.json` se commitea y el CI usa `npm ci`.
- Node se fija con `engines` (`24.x LTS`) en `package.json` y con `node-version: 24` en CI.
- Actualizaciones de seguridad: Renovate o Dependabot abre el PR, el CI corre, se revisa el advisory y se despliega. No se actualiza a ciegas ni se queda en una versión con vulnerabilidades conocidas por comodidad.
- Active LTS no significa "seguro por defecto": los advisories de Next 16.4.x se revisan antes de cada bump.

### 2.4 Migraciones

```bash
npm run db:generate   # SQL desde db/schema.ts
npm run db:migrate    # aplica contra DATABASE_URL_UNPOOLED
npm run db:studio
```

Se revisan en el PR y se ejecutan **manualmente**, nunca en el build de Vercel. El estado actual y el catálogo verificado están en `database-migrations.md`; el detalle es:

- `0000_initial_schema`: esquema base.
- `0001_score_rarity`: puntuación 0-100, `score_details` y rareza derivada.
- `0002_reconcile_legacy_schema`: reconciliación idempotente de la base creada fuera de Drizzle.
- `0003_editorial_gallery_and_game_tags`: pros/contras, video, galería y etiquetas de juego.
- `0004_games_trash_support`: papelera reversible de juegos.

La base local está en `0004`. **Neon sigue en `0002`**: no desplegar el código actual antes de aplicar `0003` y `0004` (con backup previo y aprobación explícita), porque el panel y las fichas de juego esperan esas columnas.

## 3. Backup y restauración

`npm run db:backup` genera un dump custom con `pg_dump` 18 o posterior en `backups/`, sin las tablas `sessions` ni `login_attempts`. `npm run db:restore` solo acepta localhost y bases `*_test`/`*_testing`, y deja `backup_restored_at` para que `/api/reconcile-storage` no borre objetos que la restauración acaba de recuperar. El ciclo completo está documentado en `09-backup-restore.md`.

El backup es **manual y sin cifrar**: el cifrado con `age` y la copia fuera de la máquina son la decisión pendiente A-01.
