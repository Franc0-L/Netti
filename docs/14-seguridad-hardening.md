# Seguridad y hardening — Netti (Fase 1.6)

Este documento recopila las decisiones de seguridad, políticas de cabecera y protecciones implementadas en el proyecto, así como las vulnerabilidades conocidas de dependencias y su mitigación.

## 1. Cabeceras de seguridad (CSP y relacionadas)

Todas las respuestas del sitio incluyen las siguientes cabeceras de seguridad, configuradas en `next.config.ts`:

| Cabecera | Valor | Propósito |
|----------|-------|-----------|
| `X-Content-Type-Options` | `nosniff` | Evita que el navegador adivine el tipo MIME de una respuesta. |
| `X-Frame-Options` | `DENY` | Impide que el sitio sea embebido en `<iframe>` (clickjacking). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limita la información de referencia enviada a sitios externos. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Deshabilita acceso a cámara, micrófono y geolocalización. |
| `Content-Security-Policy` | Ver detalle a continuación | Restringe qué recursos pueden cargarse y ejecutarse. |

### Content Security Policy (CSP)

La política CSP aplicada a todas las rutas (`/`):

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

#### Detalle por directiva

| Directiva | Valor | Justificación |
|-----------|-------|---------------|
| `default-src` | `'self'` | Por defecto, solo recursos del mismo origen. |
| `script-src` | `'self'` | Solo scripts del mismo origen. No se permiten scripts inline ni externos no confiables. |
| `style-src` | `'self' 'unsafe-inline'` | Estilos del mismo origen; `unsafe-inline` necesario para estilos inyectados por Next.js/Tailwind. |
| `img-src` | `'self' data: https:` | Imágenes del mismo origen, data URIs (favicons, placeholders) y HTTPS externo (imágenes de portada de artículos). |
| `font-src` | `'self'` | Fuentes autoalojadas mediante `next/font/google`. |
| `connect-src` | `'self'` | Solo conexiones al mismo origen. Las llamadas a Neon y Blob son server-side, no desde el navegador. |
| `base-uri` | `'self'` | Evita inyección de `<base>` malicioso. |
| `form-action` | `'self'` | Los formularios solo pueden enviar al mismo origen. |
| `frame-ancestors` | `'none'` | Ningún sitio puede embebedar este sitio en un iframe. |

#### Decisiones de diseño

- **No se usan nonces** para scripts inline porque Next.js 16 con Turbopack inyecta scripts dinámicos cuyo hash cambia en cada build. Mantener hashes actualizados manualmente no es sostenible sin un proceso de build que los calcule automáticamente.
- **`unsafe-inline` solo en estilos**, no en scripts. Los estilos inyectados por Tailwind v4 y Next.js requieren esta excepción.
- **No se permite `connect-src` externo** desde el navegador. Todas las llamadas a Neon y Blob se realizan server-side en Server Actions y Route Handlers.

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
- **Rate limiting de login**: backoff progresivo por IP (hash de IP con HMAC-SHA256 usando `CRON_SECRET`), empezando en el 5º intento fallido, con tope de 15 minutos.
- **Registro de intentos**: todos los intentos de login (éxitos y fallos) se registran en `login_attempts`.

## 5. Auditoría de dependencias (`npm audit`)

Resultado de `npm audit --production` ejecutado el 11 de noviembre de 2026:

| Severidad | Cantidad | Paquete afectado | Ruta de dependencia | Mitigación |
|-----------|----------|------------------|---------------------|------------|
| high | 4 | zod (< 4.6.6) | `@vercel/cli-config` → `@vercel/oidc` → `@vercel/blob` | Puede agotar memoria validando colecciones grandes restringidas (GHSA-mrhx-c7xc-m3w5). `npm audit fix --force` sugiere instalar `@vercel/cli-config`@2.4.0, cambio rotura. |

### Decisión sobre vulnerabilidades

Las 4 vulnerabilidades high residen en `@vercel/cli-config`, una dependencia de desarrollo/infraestructura de Vercel (no del runtime de la aplicación). No se expone directamente a entrada de usuario desde el navegador. Se dejó sin aplicar `npm audit fix --force` porque:

1. Es una dependencia de tooling de despliegue, no del bundle del cliente ni del servidor de la app.
2. `npm audit fix --force` introduce cambios rotura (`@vercel/cli-config`@2.4.0) que podrían afectar otros paquetes de Vercel.
3. El riesgo de explotación es bajo dado que el paquete no procesa entrada de usuario no confiable.

Se recomienda revisar periódicamente con `npm audit` y aplicar parches cuando estén disponibles sin cambios rotura.

## 6. Almacenamiento de archivos (Blob)

- Las subidas pasan por `POST /api/upload` con validación de sesión y origen.
- Tamaño máximo: 2 MiB.
- Tipos permitidos: JPEG, PNG, WebP, AVIF (validados por magic bytes, no solo por MIME declarado).
- Dimensiones máximas: 20 megapíxeles, lado mayor 2560 px.
- Re-encodado a WebP con `sharp`, sin metadatos EXIF.
- Variantes generadas: 480, 960, 1600 px (solo si son menores al ancho fuente).
- Claves de almacenamiento con UUID aleatorio (nunca el nombre original ni el slug).
- `cacheControlMaxAge: 31536000` (caché larga; la clave lleva UUID, el contenido nunca cambia).

## 7. Límites y cuotas

| Recurso | Límite | Aplicado en |
|---------|--------|-------------|
| Pool de conexiones Neon | `max: 3` por instancia | `src/db/index.ts` |
| Tiempo de subida | 10 segundos | `src/app/api/upload/route.ts` (`maxDuration`) |
| Lote de limpieza de orphans | 25 objetos por ejecución | `src/lib/cleanup-plan.ts` |
| Retención de intentos de login | 30 días | `src/app/api/cron/cleanup/route.ts` |

## 8. Qué no se implementa (por decisión de diseño)

- **No se usa nonces para CSP**: Next.js inyecta scripts dinámicos cuyo hash cambia en cada build.
- **No se almacena IP ni user-agent en logs**: el logger sanitiza campos sensibles (`ip`, `authorization`, `cookie`, etc.).
- **No hay comentarios ni cuentas de lectores**: reduce superficie de ataque (no hay registro de usuarios públicos).
- **No hay Markdown crudo**: todo pasa por `rehype-sanitize`.
