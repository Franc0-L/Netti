# Cabeceras de seguridad

Netti aplica cabeceras de seguridad en todas las respuestas a través de `vercel.json`.

## Cabeceras globales (todas las rutas)

| Cabecera | Valor | Propósito |
|----------|-------|-----------|
| `X-Content-Type-Options` | `nosniff` | Evita MIME-sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controla información de referencia |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Deshabilita APIs sensibles |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forza HTTPS |
| `Content-Security-Policy` | Ver abajo | Controla fuentes de contenido |

## Content-Security-Policy global

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self';
font-src 'self';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
object-src 'none'
```

## Cabeceras específicas

### `/admin/*`
- `X-Frame-Options: DENY` — Evita clickjacking
- CSP idéntica a la global

### `/api/*`
- `Cache-Control: no-store` — No cachear respuestas de API
- `X-Content-Type-Options: nosniff`

## Middleware de caché

El middleware de Astro aplica `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300` a respuestas HTML y JSON de 200, excepto para rutas bajo `/admin`, `/api` y `/media`.
