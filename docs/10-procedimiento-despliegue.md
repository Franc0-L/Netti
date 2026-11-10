# Procedimiento de despliegue (preparación)

Este documento describe un procedimiento futuro para Vercel Hobby. **No se realizó ningún despliegue, no se configuró Vercel y no se modificaron variables de producción** como parte de Fase 1.3.

## Antes de habilitar Vercel

- Revisar los checks de GitHub Actions del commit que se quiere desplegar.
- Revisar los cambios de esquema y preparar backup verificado.
- Crear/identificar el proyecto Neon de producción y mantener un proyecto/base independiente para previews.
- Crear el store de Vercel Blob correspondiente.
- Confirmar que el uso previsto cumple las condiciones vigentes de Vercel Hobby y que el proyecto es elegible para ese plan.
- Confirmar las variables y sus valores en un gestor seguro; no copiarlos al repositorio ni a issues/PRs.

## Crear el proyecto

1. Importar el repositorio `Franc0-L/Netti` en Vercel.
2. Seleccionar Next.js como framework detectado automáticamente.
3. Mantener el directorio raíz del proyecto, salvo que la estructura cambie.
4. No establecer un output directory personalizado para Next.js.
5. Configurar el dominio `<proyecto>.vercel.app`; no se presupone ni se configura un dominio propio.
6. Mantener separados Production, Preview y Development. No conectar previews a la base de producción.

## Variables por entorno

Configurar desde Project Settings → Environment Variables, seleccionando explícitamente el entorno correspondiente:

- `DATABASE_URL`: URL pooled de la base Neon correspondiente a ese entorno.
- `DATABASE_URL_UNPOOLED`: URL directa de esa misma base, reservada para backup y migraciones.
- `ADMIN_PASSWORD_HASH`: hash scrypt generado para el acceso editorial.
- `BLOB_READ_WRITE_TOKEN`: token del store Blob correspondiente.
- `CRON_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `PUBLIC_SITE_URL`: URL canónica del deployment; en producción, el dominio `.vercel.app` elegido.

`DATABASE_POOL_MAX` puede configurarse opcionalmente; el valor predeterminado del código es 2 por instancia. No cargar variables que no usa el código actual como si fueran obligatorias. Ver [09-variables-entorno.md](./09-variables-entorno.md) para el inventario completo y las diferencias históricas.

## Migración de base de datos

La configuración de Drizzle lee `DATABASE_URL_UNPOOLED`; la aplicación utiliza `DATABASE_URL` para el pool de consultas. Antes de ejecutar una migración:

1. Crear un backup con `DATABASE_URL_UNPOOLED`.
2. Validar el archivo con `pg_restore --list`.
3. Revisar el SQL de migración y confirmar que es compatible con el estado real de esa base.
4. Ejecutar `npm run db:migrate` desde un entorno controlado con `DATABASE_URL_UNPOOLED` del entorno correcto.
5. Verificar el esquema y el comportamiento de la aplicación.

No ejecutar `db:migrate` automáticamente desde el build de Vercel. No aplicar el baseline inicial sobre una base que ya tenga tablas sin inspeccionar/introspectar primero.

## Verificaciones posteriores al despliegue

- Abrir la portada y las colecciones públicas.
- Consultar `/api/health` (actualmente es un liveness simple; no prueba Neon ni Blob).
- Probar login y cierre de sesión desde el origen configurado.
- Crear un borrador, editarlo y comprobar su persistencia.
- Probar subida de imagen solo después de confirmar el token/store del entorno.
- Verificar logs del deployment y errores de runtime.
- Confirmar que las variables no aparecen en logs o respuestas.

La publicación programada y la ejecución del endpoint de limpieza no deben darse por operativas hasta que exista un mecanismo programador configurado y probado. Este PR no configura Vercel Cron.

## Cron futuro

Cuando se decida habilitar un scheduler, revisar primero el plan vigente de Vercel y sus límites para la frecuencia requerida. El endpoint existente es `/api/cron/cleanup` y exige `Authorization: Bearer <CRON_SECRET>`. No se crea una programación en este bloque. Definir frecuencia, zona horaria, reintentos y alertas antes de activarlo.

## Rollback

Si el deployment presenta errores:

1. Detener cambios de esquema y tareas programadas.
2. Revisar logs y variables del entorno sin copiar secretos.
3. Volver al deployment anterior desde el panel de Vercel si el problema es de aplicación.
4. Si hubo una migración incompatible, no ejecutar un rollback SQL improvisado: evaluar el cambio y restaurar primero en un entorno de prueba.
5. Registrar el incidente y la decisión de recuperación.
