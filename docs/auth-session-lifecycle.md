# Ciclo de vida de sesiones

Este contrato acompaña a `src/lib/auth.ts`. La sesión es opaca para el navegador y revocable desde PostgreSQL.

## Emisión

`createSessionToken()` devuelve dos valores:

- `token`: secreto aleatorio de 256 bits, codificado en base64url. Es el único valor que se envía en la cookie HttpOnly.
- `sessionId`: SHA-256 hexadecimal del token. Es el valor que se persiste en `sessions.id`.

Nunca persistir el token en claro ni registrarlo en logs. La acción de login que cree la fila debe fijar `expiresAt` a 8 horas y `absoluteExpiresAt` a 30 días desde la emisión.

## Validación y renovación

`requireSession()` calcula el digest del token recibido y busca la fila por ese digest. Rechaza y revoca la sesión cuando:

- no existe la fila;
- `expiresAt` ya venció (límite de inactividad);
- `absoluteExpiresAt` ya venció (límite absoluto).

Cuando pasaron al menos cinco minutos desde `lastUsedAt`, renueva `lastUsedAt` y `expiresAt`. La nueva expiración es el menor valor entre ahora + 8 horas y `absoluteExpiresAt`. De esta forma, el uso continuo no extiende la sesión más allá de 30 días y las lecturas frecuentes no escriben en PostgreSQL en cada request.

## Cierre

- `logout()` elimina la fila asociada al digest del token actual y borra la cookie, incluso si falla el borrado en la base.
- `logoutAll()` elimina todas las filas y borra la cookie actual.
- Las cookies no sustituyen la revocación en base de datos: borrar solo la cookie dejaría sesiones válidas hasta su vencimiento.

## Validación pendiente

El repositorio todavía no contiene la Server Action de login que inserta la sesión y emite la cookie. Al implementarla, debe usar `createSessionToken()`, persistir `sessionId` (nunca `token`) y emitir `token` en cookie con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` y duración máxima de 30 días.

Las pruebas de integración pendientes deben cubrir: token aleatorio distinto por emisión; la base solo recibe el digest; expiración idle; expiración absoluta aunque haya actividad; renovación solo cada cinco minutos; revocación de una sesión; cierre global; y origen inválido/ausente/no permitido.
