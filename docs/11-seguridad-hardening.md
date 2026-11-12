# Seguridad y hardening — Netti (Fase 1.6)

Este documento recopila las decisiones de seguridad, políticas de cabecera y protecciones implementadas en el proyecto, así como el estado de las dependencias.

## 1. Cabeceras de seguridad (CSP y relacionadas)

Las cabeceras base se configuran en `next.config.ts` y se aplican a todas las respuestas:

| Cabecera                    | Valor                                      | Propósito                                                       |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                  | Evita que el navegador adivine el tipo MIME de una respuesta.   |
| `X-Frame-Options`           | `DENY`                                     | Impide que el sitio sea embebido en `<iframe>` (clickjacking).  |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`          | Limita la información de referencia enviada a sitios externos.  |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()` | Deshabilita acceso a cámara, micrófono y geolocalización.       |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains`      | Fuerza HTTPS en producción (solo cuando `NODE_ENV=production`). |
| `Content-Security-Policy`   | Dos políticas, ver detalle                 | Restringe qué recursos pueden cargarse y ejecutarse.            |

La CSP se emite desde `src/proxy.ts`, no desde `next.config.ts`, porque el panel necesita un nonce por solicitud.

### Content Security Policy (CSP)

Next.js App Router emite scripts inline para la hidratación y el streaming de RSC. Una política con solo `script-src 'self'` bloquea esos scripts y rompe la hidratación, incluido el panel. Por eso se aplican dos políticas:

**Rutas públicas** (todo excepto `/admin`):

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://*.public.blob.vercel-storage.com https://*.vercel-storage.com;
font-src 'self';
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

En desarrollo se agregan `'unsafe-eval'` (compilación de Turbopack) y `ws:` en `connect-src`.

**Rutas `/admin`**: nonce por solicitud y `strict-dynamic`:

```
script-src 'self' 'nonce-<aleatorio>' 'strict-dynamic';
```

El nonce se genera en el proxy, se envía en la cabecera CSP de la solicitud (para que Next.js lo aplique a sus etiquetas `<script>`) y se devuelve en la cabecera CSP de la respuesta. El panel ya es dinámico (lee la cookie de sesión), así que el nonce no afecta al caché.

`'unsafe-inline'` se mantiene en las rutas públicas porque todo el HTML lo genera la aplicación a partir de contenido controlado y sanitizado: no hay HTML de usuario sin filtrar. La política con hashes para el sitio público queda como validación futura.

#### Detalle por directiva

| Directiva         | Valor                                            | Justificación                                                                                            |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `default-src`     | `'self'`                                         | Por defecto, solo recursos del mismo origen.                                                             |
| `script-src`      | `'self' 'unsafe-inline'` público / nonce         | Los scripts inline de Next.js requieren autorización explícita; el panel usa nonce por solicitud.        |
| `style-src`       | `'self' 'unsafe-inline'`                         | Estilos del mismo origen; `unsafe-inline` es necesario para los estilos inyectados por Next.js/Tailwind. |
| `img-src`         | `'self' data:` + Blob + `IMAGES_PUBLIC_BASE_URL` | Las imágenes viven en Vercel Blob; `data:` cubre favicons y placeholders.                                |
| `font-src`        | `'self'`                                         | Fuentes autoalojadas.                                                                                    |
| `connect-src`     | `'self'`                                         | Las llamadas a Neon y Blob son server-side, no desde el navegador.                                       |
| `object-src`      | `'none'`                                         | Bloquea plugins y objetos embebidos.                                                                     |
| `base-uri`        | `'self'`                                         | Evita inyección de `<base>` malicioso.                                                                   |
| `form-action`     | `'self'`                                         | Los formularios solo pueden enviar al mismo origen.                                                      |
| `frame-ancestors` | `'none'`                                         | Ningún sitio puede embeber este sitio en un iframe.                                                      |

La política se valida en `npm run test:http`: la prueba comprueba que las rutas públicas autorizan los scripts inline y que `/admin` emite un nonce y que Next.js lo aplica a las etiquetas `<script>` renderizadas.

## 2. Protección CSRF (falsificación de solicitud entre sitios)

Todas las Server Actions de mutación y los endpoints de escritura verifican el origen de la solicitud mediante `assertSameOrigin` (`src/lib/auth.ts`):

- `POST /api/upload` — subida de imágenes.
- `createArticle`, `updateArticle`, `publishArticle` — Server Actions de contenido.
- `login`, `logout`, `logoutAll` — Server Actions de autenticación.

`assertSameOrigin` valida que el encabezado `Origin` o `Referer` coincida con `PUBLIC_SITE_URL` configurada. Si no coincide, la solicitud se rechaza con `403 Forbidden`.

Además, las rutas de administración (`/admin/*`) requieren sesión válida mediante `requireSession()`, que valida la cookie de sesión contra la tabla `sessions` en la base de datos.

## 3. Validación de entradas (Zod)

Todas las entradas de usuario pasan por esquemas Zod en `src/lib/validation.ts`:

- **Slug**: solo minúsculas, números y guiones (`^[a-z0-9]+(?:-[a-z0-9]+)*$`).
- **Título**: máximo 120 caracteres, obligatorio al publicar.
- **Descripción**: máximo 240 caracteres.
- **Cuerpo (body)**: mínimo 10 caracteres al publicar.
- **Etiquetas**: máximo 5, sin duplicados (insensible a mayúsculas), 1-30 caracteres cada una.
- **Autor**: máximo 60 caracteres.
- **Fecha de publicación**: debe ser ISO datetime válida al publicar.
- **Campos de reseña**: `gameId`, `score` (1-10), `scoreReason` (mínimo 20), `verdict` (mínimo 10).
- **URLs de fuente**: esquema `http://` o `https://`.
- **ID de medios**: enteros positivos, referencias validadas contra la tabla `media`.

La sanitización de Markdown usa `remark` + `rehype` + `rehype-sanitize` (`src/components/markdown-content.tsx`), eliminando HTML crudo, JavaScript en enlaces y CDATA malicioso.

## 4. Autenticación y sesiones

- **Contraseña de admin**: hash scrypt con N=131072 (2^17), r=8, p=1, almacenado en `ADMIN_PASSWORD_HASH` con formato `scrypt:131072:8:1:<saltB64>:<hashB64>`.
- **Token de sesión**: 256 bits aleatorios (SHA-256), almacenado como hash en la tabla `sessions`.
- **Cookie de sesión**: `HttpOnly`, `Secure`, `SameSite=Lax`, `maxAge` = 30 días (expiración absoluta).
- **Expiración idle**: 8 horas deslizantes (se renueva en cada uso).
- **Expiración absoluta**: 30 días (tope absoluto sin importar la actividad).
- **Rate limiting de login**: backoff progresivo por IP (hash de IP con HMAC-SHA256 usando `CRON_SECRET`), empezando en el 5.º intento fallido, con tope de 15 minutos.
- **Atomicidad del rate limiting**: `attemptLogin` ejecuta el control de intentos, la verificación scrypt y el registro dentro de una transacción con `pg_advisory_xact_lock` por IP. Sin el bloqueo, varias solicitudes simultáneas podían leer el mismo contador y superar el límite. La prueba `npm run test:db` verifica que 10 intentos concurrentes de una misma IP producen exactamente 5 permitidos.
- **Registro de intentos**: todos los intentos de login (éxitos y fallos) se registran en `login_attempts`.

## 5. Auditoría de dependencias (`npm audit`)

Estado al 11 de noviembre de 2026: `npm audit --omit=dev` informa **0 vulnerabilidades**.

Antes de la corrección había 4 alertas `high` por `zod < 4.6.6` en la ruta `@vercel/cli-config` → `@vercel/oidc` → `@vercel/blob` (GHSA-mrhx-c7xc-m3w5). Se resolvió sin `--force` mediante un `overrides` en `package.json`:

```json
"overrides": {
  "@vercel/cli-config": {
    "zod": "^4.6.7"
  }
}
```

El lockfile se regeneró y `npm ci` instala exactamente ese árbol. CI ejecuta `npm audit --omit=dev --audit-level=high` en cada push y pull request.

No se usa `npm audit fix --force`: proponía un cambio de versión mayor de `@vercel/blob` sin necesidad.

## 6. Almacenamiento de archivos (Blob)

- Las subidas pasan por `POST /api/upload` con validación de sesión y origen.
- El cuerpo de la solicitud se lee con un límite duro (`readLimitedBody`, 2 MiB + 128 KiB) antes de parsear `multipart`. Confiar solo en `Content-Length` no alcanza: el encabezado puede faltar y `request.formData()` procesaría todo el cuerpo.
- Tamaño máximo del archivo: 2 MiB.
- Tipos permitidos: JPEG, PNG, WebP, AVIF (validados por magic bytes, no solo por MIME declarado).
- Dimensiones máximas: 20 megapíxeles, lado mayor 2560 px.
- Re-encodado a WebP con `sharp`, sin metadatos EXIF.
- Variantes generadas: 480, 960, 1600 px (solo si son menores al ancho fuente).
- Claves de almacenamiento con UUID aleatorio (nunca el nombre original ni el slug).
- `cacheControlMaxAge: 31536000` (caché larga; la clave lleva UUID, el contenido nunca cambia).

## 7. Límites y cuotas

| Recurso                          | Límite                                    | Aplicado en                                               |
| -------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Pool de conexiones por instancia | `DATABASE_POOL_MAX`, 2 por defecto (1-10) | `src/db/index.ts`                                         |
| Pool del proxy                   | 1 conexión; slugs cacheados 15 s          | `src/lib/public-content-guard.ts`                         |
| Cuerpo de subida                 | 2 MiB + 128 KiB                           | `src/app/api/upload/route.ts` (`readLimitedBody`)         |
| Tiempo de subida                 | 10 segundos                               | `src/app/api/upload/route.ts` (`maxDuration`)             |
| Lote de limpieza de orphans      | 25 objetos por ejecución                  | `src/app/api/cron/cleanup/route.ts`                       |
| Lote de reconciliación           | 50 filas por ejecución                    | `src/app/api/reconcile-storage/route.ts`                  |
| Retención de intentos de login   | 7 días                                    | `src/app/api/cron/cleanup/route.ts` y `reconcile-storage` |

### 7.1 El proxy consulta la base

El proxy decide los 404 antes de renderizar (ver D-023 en `01-stack-arquitectura.md`). Para eso usa un pool propio con `max: 1`:

- El conjunto de slugs visibles de cada colección se cachea 15 segundos en memoria.
- Un slug desconocido se confirma con una consulta indexada y se cachea como ausente durante 10 segundos.
- Hay un presupuesto de 20 confirmaciones por minuto y por instancia; agotado, el control falla abierto y deja que la página bloqueante decida su propio 404. El presupuesto nunca produce un 404 falso.
- Los slugs anteriores se resuelven contra `redirects` antes del 404, con caché de 15 s y validación de que el destino sea una ruta interna absoluta (`isSafeRedirectTarget`).
- Ante un error de base de datos el control falla abierto: la página decide y puede responder 200.

El presupuesto limita el costo del tráfico de rastreadores: como máximo una consulta por minuto y por instancia para la lista completa, más las confirmaciones permitidas. El 404 que devuelve el proxy incluye la CSP pública, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control: no-store`.

## 8. Qué no se implementa (por decisión de diseño)

- **Hashes CSP en el sitio público**: se usa `'unsafe-inline'` porque el HTML es generado por la app a partir de contenido sanitizado; el panel sí usa nonce. Endurecer el sitio público con hashes queda pendiente de medición.
- **No se almacena IP ni user-agent en logs**: el logger sanitiza campos sensibles (`ip`, `authorization`, `cookie`, etc.).
- **No hay comentarios ni cuentas de lectores**: reduce superficie de ataque (no hay registro de usuarios públicos).
- **No hay Markdown crudo**: todo pasa por `rehype-sanitize`.

## 9. Verificación continua

CI (`.github/workflows/quality.yml`) usa Node 24 y `npm ci` (lockfile obligatorio), con dos trabajos:

1. **validate**: tests unitarios, ESLint, Prettier (`--check` sobre todo el repo), typecheck, build de producción y `npm audit --omit=dev --audit-level=high`.
2. **integration**: PostgreSQL 18 como servicio, `npm run db:migrate`, build, `npm run test:db` (auth, sesiones, rate limiting atómico contra la base real) y `npm run test:http` (CSP, cookies de sesión, origen, cron y límites de subida contra el servidor real).

`npm run test:db` exige una base PostgreSQL en loopback (`localhost`, `127.0.0.1` o `::1`), porque inserta y borra fixtures de sesiones e intentos de login mientras ejercita los flujos; un nombre que termine en `_test` no autoriza un host remoto. `npm run test:http` aplica la misma restricción.

Pendiente de integración real (requiere credenciales): subida a Vercel Blob, ejecución del scheduler de GitHub Actions con `NETTI_SITE_URL` y `CRON_SECRET`, y métricas de Neon en producción.
