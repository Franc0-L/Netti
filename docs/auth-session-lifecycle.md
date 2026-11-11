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

## Validación

La Server Action `login` (`src/app/actions/auth.ts`) usa `createSessionToken()`, persiste `sessionId` (nunca `token`) y emite `token` en cookie con `HttpOnly`, `Secure` en producción, `SameSite=Lax`, `Path=/` y duración máxima de 30 días.

`npm run test:db` cubre contra PostgreSQL real: token aleatorio distinto por emisión; la base solo recibe el digest; backoff tras cinco fallos; atomicidad bajo concurrencia; y aceptación de la contraseña correcta. `npm run test:http` cubre: sesión ausente o falsificada rechazada, sesión válida aceptada y origen inválido rechazado en mutaciones.

Pendiente de un entorno con navegador: expiración idle y absoluta observadas de punta a punta, renovación cada cinco minutos, cierre global y caducidad de la cookie.
