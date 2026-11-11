# Monitoreo y observabilidad

## Health check: `GET /api/health`

El endpoint comprueba dependencias en tiempo real y responde con `Cache-Control: no-store`.

- `status: ok`: Neon y Blob respondieron correctamente.
- `status: degraded`: la base responde, pero Blob no tiene token configurado y se omitió la comprobación.
- `status: unhealthy`: falló una dependencia configurada; HTTP 503.

`dependencies.database` ejecuta `SELECT 1` mediante el pool de Drizzle. `dependencies.blob` realiza una operación acotada de listado con prefijo reservado y límite 1; no devuelve nombres de objetos ni URLs. Si no hay `BLOB_READ_WRITE_TOKEN`, la dependencia queda como `skipped`. Un error de Neon o de Blob configurado produce HTTP 503.

El endpoint no requiere autenticación para permitir comprobaciones externas de disponibilidad. No devuelve mensajes de excepción, cadenas de conexión, tokens ni detalles internos.

## Métricas: `GET /api/metrics`

Este endpoint exige una sesión administrativa válida. Devuelve contadores agregados:

- `publishedArticles`: artículos cuyo estado actual es `published`.
- `activeSessions`: sesiones no vencidas por expiración idle ni absoluta.
- `storedImages`: registros actuales en la tabla `media`. Es un inventario de imágenes registradas, no un contador histórico de intentos de subida ni de operaciones Blob.

Las métricas se consultan en PostgreSQL en cada petición y llevan `Cache-Control: no-store`. No se persisten snapshots ni se añade infraestructura externa de métricas.

## Logging estructurado

La utilidad `src/lib/logger.ts` emite una línea JSON por evento con timestamp ISO, nivel (`info`, `warn`, `error`) y nombre de evento. Está integrada en las Server Actions de autenticación y en los endpoints de health y métricas.

Ejemplos de eventos:

- `admin.login.succeeded`, `admin.login.rejected`, `admin.login.rate_limited`
- `admin.logout.succeeded`
- `health.database.failed`, `health.blob.failed`
- `metrics.query.failed`

No se registran contraseñas, tokens, cookies, cabeceras de autorización, IP, user-agent, cuerpos de solicitudes ni mensajes de excepción. La utilidad elimina campos con nombres sensibles y redacta patrones comunes de credenciales. Aun así, los eventos y el contexto deben ser diseñados sin incluir datos personales ni secretos.

## Dónde consultar los logs

- Desarrollo local: salida estándar del proceso `npm run dev`.
- Vercel, cuando se habilite el despliegue: Runtime Logs del proyecto y entorno correspondiente. Este PR no crea ni modifica configuración de Vercel.

Filtrá por `level` y `event`; no copies líneas completas a tickets públicos si en el futuro se agregan campos contextuales.

## Coste y límites

- Cada petición a `/api/health` ejecuta una consulta PostgreSQL y, si hay token, una operación de listado Blob. Evitá sondearlo con intervalos innecesariamente cortos.
- Cada petición a `/api/metrics` ejecuta tres consultas de conteo y requiere autenticación.
- Los logs se envían a la salida estándar; retención, alertas y exportación dependen del proveedor de hosting y no se configuran en este bloque.
- No hay trazas distribuidas, métricas temporales, dashboards ni alertas automáticas implementadas.

## Diagnóstico

1. Si health devuelve 503, revisá el estado de Neon y Blob por separado.
2. Si solo falla `database`, comprobá conectividad, credenciales y límites del pool sin exponer la URL.
3. Si falla `blob`, verificá que el token pertenezca al store correcto y conserve permisos de lectura/listado.
4. Si métricas devuelve 401, iniciá sesión nuevamente en el panel.
5. Si métricas devuelve 503, correlacioná el timestamp con el evento `metrics.query.failed` en los logs.
