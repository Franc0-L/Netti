# Sesiones de administración

El panel editorial (`/admin/`) usa autenticación basada en cookies de sesión firmadas.

## Flujo de autenticación

1. El usuario envía su contraseña a `POST /api/admin/login` con `action: "login"`
2. El servidor verifica la contraseña contra `ADMIN_PASSWORD` usando comparación en tiempo constante (`timingSafeEqual`)
3. Si es correcta, se crea una sesión firmada con HMAC-SHA256 usando `ADMIN_SESSION_SECRET`
4. La sesión se envía como cookie `netti_admin` (HttpOnly, SameSite=Strict, Secure en producción)
5. Las cookies expiran después de 8 horas

## Validación de sesión

Cada request a las APIs del panel verifica:
- Presencia y validez de la cookie de sesión
- Firma HMAC válida (evita falsificación)
- Expiración no superada
- Origen de la petición coincide con el host del servidor (anti-CSRF)

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `ADMIN_PASSWORD` | Contraseña de acceso al panel |
| `ADMIN_SESSION_SECRET` | Secreto para firmar sesiones (mínimo 32 caracteres) |

## Cierre de sesión

`POST /api/admin/login` con `action: "logout"` elimina la cookie de sesión.

## Rate limiting

- Máximo 10 intentos por IP en 15 minutos
- Máximo 120 intentos globales en 15 minutos (configurable con `ADMIN_LOGIN_GLOBAL_MAX`)
- Respuesta 429 con `Retry-After` cuando se supera el límite
