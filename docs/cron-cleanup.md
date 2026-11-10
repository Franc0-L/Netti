# Cron de limpieza

## Endpoint

GET /api/cron/cleanup

Requiere Authorization: Bearer $CRON_SECRET. La comparación del token usa timingSafeEqual y el secreto debe tener al menos 32 caracteres. La ruta no expone datos de errores internos y devuelve Cache-Control: no-store.

## Trabajo por ejecución

- Elimina intentos de login con más de 30 días.
- Elimina sesiones con expiración idle o absoluta vencida.
- Revisa hasta 25 registros storage_orphans pendientes por ejecución.
- Antes de borrar un objeto de Blob, comprueba que su storageKey no siga referenciado por media ni media_variants.
- Un registro de acción put que ya esté referenciado se cierra como reparado sin borrar el objeto.
- Un registro de acción delete que todavía esté referenciado se deja pendiente y se cuenta como bloqueado.
- Los errores de Blob dejan el registro pendiente para reintentar en la siguiente ejecución.
- Registra lastRunAt/lastSuccessAt en cron_runs.

## Operación

El endpoint está implementado pero no se programa desde Vercel en esta fase. No se añade cron a vercel.json ni se modifica configuración del proyecto. La programación y prueba con credenciales reales se dejan para el bloque final de integración.

El batch de 25 y maxDuration 10s limitan el trabajo por invocación en el plan Hobby. Si se acumulan más huérfanos, las siguientes ejecuciones continúan desde los más antiguos.
