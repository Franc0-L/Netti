# Cron de limpieza

## Endpoints

Los tres endpoints programados comparten `src/lib/cron-auth.ts`:

| Endpoint                 | Método | Función                                                  |
| ------------------------ | ------ | -------------------------------------------------------- |
| `/api/cron/cleanup`      | GET    | Purga sesiones/intentos y reintenta orphans de Blob      |
| `/api/revalidate`        | POST   | Activa publicaciones programadas e invalida tags         |
| `/api/reconcile-storage` | POST   | Reconciliación basada en DB con guarda tras restauración |

Todos requieren `Authorization: Bearer $CRON_SECRET`. La comparación usa `timingSafeEqual`, el secreto debe tener al menos 32 caracteres y la longitud se comprueba antes de comparar. Las rutas no exponen errores internos y devuelven `Cache-Control: no-store`.

## Trabajo por ejecución (`/api/cron/cleanup`)

- Elimina intentos de login con más de 7 días.
- Elimina sesiones con expiración idle o absoluta vencida.
- Revisa hasta 25 registros `storage_orphans` pendientes por ejecución.
- Antes de borrar un objeto de Blob, comprueba que su `storageKey` no siga referenciado por `media` ni `media_variants`.
- Un registro de acción `put` que ya esté referenciado se cierra como reparado sin borrar el objeto.
- Un registro de acción `delete` que todavía esté referenciado se deja pendiente y se cuenta como bloqueado.
- Los errores de Blob dejan el registro pendiente para reintentar en la siguiente ejecución.
- Registra `lastRunAt`/`lastSuccessAt` en `cron_runs`.

## Reconciliación (`/api/reconcile-storage`)

- Se bloquea con `409` si hubo una restauración de backup en los últimos 7 días.
- Purga sesiones expiradas y intentos con más de 7 días.
- Reintenta hasta 50 orphans pendientes.
- Barre hasta 50 medios con `pending_delete_at` vencido (más de 24 h): si ya no están referenciados, borra sus objetos y la fila; si falla Blob, registra un orphan para el próximo intento.
- No lista el store completo de Blob: esa parte requiere credenciales reales y medición de operaciones.

## Operación

Los endpoints están implementados pero no se programan desde Vercel en esta fase. No se añade cron a `vercel.json` ni se modifica configuración del proyecto. La programación y prueba con credenciales reales se dejan para el bloque final de integración.

El batch de 25 y `maxDuration` de 10 s limitan el trabajo por invocación en el plan Hobby. Si se acumulan más huérfanos, las siguientes ejecuciones continúan desde los más antiguos.
