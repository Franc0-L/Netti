# Monitoreo y observabilidad

## Liveness: `GET /api/health`

Comprueba únicamente que el proceso responde. No toca PostgreSQL ni Blob, así que no despierta el cómputo de Neon. Responde `200` con `Cache-Control: no-store`:

```json
{ "status": "ok", "service": "netti", "checkedAt": "2026-11-11T09:08:23.872Z" }
```

No requiere autenticación: es el endpoint para el monitor externo de disponibilidad.

## Readiness: `GET /api/ready`

Requiere `Authorization: Bearer $CRON_SECRET` y responde `401` sin credenciales. Comprueba dependencias en tiempo real y no devuelve mensajes de excepción, cadenas de conexión ni tokens.

- `status: ok`: Neon y Blob respondieron correctamente.
- `status: degraded`: una dependencia no configurada se omitió (por ejemplo Blob sin token).
- `status: unhealthy`: falló una dependencia configurada; HTTP 503.

`dependencies.database` ejecuta `SELECT 1` mediante el pool de Drizzle. `dependencies.blob` realiza una operación acotada de listado con prefijo reservado y límite 1; no devuelve nombres de objetos ni URLes.

## Métricas: `GET /api/metrics`

Este endpoint exige una sesión administrativa válida. Devuelve contadores agregados:

- `publishedArticles`: artículos cuyo estado actual es `published`.
- `activeSessions`: sesiones no vencidas por expiración idle ni absoluta.
- `storedImages`: registros actuales en la tabla `media`. Es un inventario de imágenes registradas, no un contador histórico de intentos de subida ni de operaciones Blob.

Las métricas se consultan en PostgreSQL en cada petición y llevan `Cache-Control: no-store`. No se persisten snapshots ni se añade infraestructura externa de métricas.

## Estado de los jobs programados

`cron_runs` es la fuente para saber si un job corrió y si terminó bien:

- `last_run_at` avanza en cada ejecución, incluso cuando falla.
- `last_success_at` solo avanza cuando la ejecución terminó sin errores obligatorios. En `reconcile-storage`, un fallo de Blob o un borrado pendiente deja la marca anterior y responde `500`.
- `backup_restored_at` en `job_name = 'backup_restore'` bloquea la reconciliación durante siete días.

Un `last_run_at` reciente con `last_success_at` viejo indica un job que se ejecuta pero falla de forma persistente.

## Logging estructurado

La utilidad `src/lib/logger.ts` emite una línea JSON por evento con timestamp ISO, nivel (`info`, `warn`, `error`) y nombre de evento. Está integrada en las Server Actions de autenticación y en los endpoints de readiness y métricas.

Ejemplos de eventos:

- `admin.login.succeeded`, `admin.login.rejected`, `admin.login.rate_limited`
- `admin.logout.succeeded`
- `ready.database.failed`, `ready.blob.failed`
- `metrics.query.failed`

No se registran contraseñas, tokens, cookies, cabeceras de autorización, IP, user-agent, cuerpos de solicitudes ni mensajes de excepción. La utilidad elimina campos con nombres sensibles y redacta patrones comunes de credenciales. Aun así, los eventos y el contexto deben ser diseñados sin incluir datos personales ni secretos.

## Dónde consultar los logs

- Desarrollo local: salida estándar del proceso `npm run dev`.
- Vercel, cuando se habilite el despliegue: Runtime Logs del proyecto y entorno correspondiente. Este PR no crea ni modifica configuración de Vercel.

Filtrá por `level` y `event`; no copies líneas completas a tickets públicos si en el futuro se agregan campos contextuales.

## Coste y límites

- `/api/health` no ejecuta consultas ni operaciones de Blob: se puede sondear con frecuencia.
- `/api/ready` ejecuta `SELECT 1` y, si hay token, un listado Blob acotado. Sondealo con baja frecuencia o solo desde el runbook.
- Cada petición a `/api/metrics` ejecuta tres consultas de conteo y requiere autenticación.
- Los logs se envían a la salida estándar; retención, alertas y exportación dependen del proveedor de hosting y no se configuran en este bloque.
- No hay trazas distribuidas, métricas temporales, dashboards ni alertas automáticas implementadas.

## Diagnóstico

1. Si health devuelve 503, revisá el estado de Neon y Blob por separado.
2. Si solo falla `database`, comprobá conectividad, credenciales y límites del pool sin exponer la URL.
3. Si falla `blob`, verificá que el token pertenezca al store correcto y conserve permisos de lectura/listado.
4. Si métricas devuelve 401, iniciá sesión nuevamente en el panel.
5. Si métricas devuelve 503, correlacioná el timestamp con el evento `metrics.query.failed` en los logs.
