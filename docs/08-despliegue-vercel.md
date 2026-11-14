# Despliegue en Vercel Hobby — Netti

## Antes del despliegue

### 1. Repositorio y código

- [ ] Rama `main` sincronizada con `origin/main`
- [ ] Working tree limpio (`git status` muestra "nothing to commit")
- [ ] `npm run build` pasa sin errores
- [ ] `npm run typecheck` pasa sin errores
- [ ] `npm run lint` pasa sin errores ni warnings
- [ ] `npm run format:check` pasa
- [ ] `npm test` pasa (61/61)
- [ ] `npm run test:db`, `npm run test:migrations` y `npm run test:baseline` pasan contra PostgreSQL local
- [ ] `npm run test:http` pasa contra `next start` en loopback
- [ ] `npm run db:migrate` ejecutado contra la base de producción de Neon **después** de un backup nuevo

> **Bloqueante**: Neon está en `0002_reconcile_legacy_schema` y el código del repositorio usa `0003` y `0004`. No desplegar hasta que la migración esté aplicada y verificada; el panel y las fichas de juego fallarían sin esas columnas.

### 2. Variables de entorno

Configurar en el dashboard de Vercel (Settings → Environment Variables):

| Variable                | Valor                                         | Entorno                          |
| ----------------------- | --------------------------------------------- | -------------------------------- |
| `DATABASE_URL`          | URL pooled de Neon                            | Production, Preview, Development |
| `DATABASE_URL_UNPOOLED` | URL directa de Neon                           | Production, Preview, Development |
| `ADMIN_PASSWORD_HASH`   | Hash scrypt generado con `npm run hash:admin` | Production, Preview, Development |
| `BLOB_READ_WRITE_TOKEN` | Token de Vercel Blob                          | Production, Preview, Development |
| `CRON_SECRET`           | Secreto de al menos 32 caracteres             | Production, Preview, Development |
| `IP_HASH_SECRET`        | Secreto de al menos 32 caracteres             | Production, Preview, Development |
| `PUBLIC_SITE_URL`       | `https://tu-proyecto.vercel.app`              | Production, Preview, Development |

`IP_HASH_SECRET` puede omitirse: en ese caso el HMAC de las IPs usa `CRON_SECRET`. Definirla aparte permite rotar el secreto del cron sin perder la continuidad del rate limiting.

> ⚠️ No subir `.env.local` ni `.env` al repositorio. Están en `.gitignore`.

Variables opcionales: `VERCEL_OIDC_TOKEN`, `BLOB_STORE_ID`, `EDGE_CONFIG_ID`, `IMAGES_PUBLIC_BASE_URL`, `DATABASE_POOL_MAX` (predeterminado 2).

### 3. Base de datos Neon

- [ ] Proyecto creado en región `sa-east-1`
- [ ] Base de datos `neondb` migrada hasta `0004` (`npm run db:migrate`)
- [ ] `DATABASE_URL_UNPOOLED` disponible para backups y migraciones
- [ ] Límite de conexiones monitoreado (pool de 2 por instancia por defecto, `DATABASE_POOL_MAX`)

### 4. Vercel Blob

- [ ] Store de Blob creado en el dashboard de Vercel
- [ ] Token `READ_WRITE_TOKEN` copiado para desarrollo local y CI
- [ ] Límite de 1 GB de almacenamiento monitoreado (Hobby bloquea el store al excederlo, no cobra)

### 5. Cron

- [ ] Endpoint `/api/cron/cleanup` probado localmente
- [ ] Workflow `.github/workflows/scheduled-jobs.yml` activo en `main`
- [ ] Secretos de repositorio `NETTI_SITE_URL` y `CRON_SECRET` configurados en GitHub
- [ ] `CRON_SECRET` coincide con el configurado en Vercel
- [ ] Primera ejecución manual (`workflow_dispatch`) de los tres jobs verificada en `cron_runs`

## Crear el proyecto

1. Importar el repositorio en Vercel.
2. Seleccionar Next.js como framework detectado automáticamente.
3. Mantener el directorio raíz del proyecto, salvo que la estructura cambie.
4. No establecer un output directory personalizado para Next.js.
5. Configurar el dominio `<proyecto>.vercel.app`; no se presupone ni se configura un dominio propio.
6. Mantener separados Production, Preview y Development. No conectar previews a la base de producción.

## Cutover desde el proyecto legacy

El proyecto `netti` de Vercel apunta hoy al sitio Astro. El reemplazo se hace cuando el contenido y la migración estén validados, no antes:

1. Confirmar que Neon está en `0004` y que el backup nuevo se verificó con `pg_restore --list`.
2. Confirmar que `main` tiene el código final y que todos los checks pasan en GitHub.
3. Anotar el dominio, las variables de entorno y el store de Blob del proyecto actual (los valores de los secretos no se copian a ningún documento).
4. Borrar el proyecto `netti` antiguo y crear uno nuevo importando este repositorio, con las variables de la tabla de arriba.
5. Comprobar que el dominio `.vercel.app` quedó asignado. Si Vercel lo retiene unos minutos, usar el dominio temporal del deployment mientras se libera.
6. Repetir las verificaciones posteriores al despliegue.

El store de Blob y la base de Neon son recursos de la cuenta, no del proyecto: borrar el proyecto de Vercel no los elimina. Aun así, revisá en el dashboard que el store sigue existiendo y que el proyecto nuevo puede escribir en él antes de subir imágenes.

## Variables por entorno

Configurar desde Project Settings → Environment Variables, seleccionando explícitamente el entorno correspondiente:

- `DATABASE_URL`: URL pooled de la base Neon correspondiente a ese entorno.
- `DATABASE_URL_UNPOOLED`: URL directa de esa misma base, reservada para backup y migraciones.
- `ADMIN_PASSWORD_HASH`: hash scrypt generado para el acceso editorial.
- `BLOB_READ_WRITE_TOKEN`: token del store Blob correspondiente.
- `CRON_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `PUBLIC_SITE_URL`: URL canónica del deployment; en producción, el dominio `.vercel.app` elegido.

`DATABASE_POOL_MAX` puede configurarse opcionalmente; el valor predeterminado del código es 2 por instancia.

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
- Consultar `/api/health` (liveness; no prueba Neon ni Blob). Para readiness, llamar a `/api/ready` con `Authorization: Bearer $CRON_SECRET`.
- Probar login y cierre de sesión desde el origen configurado.
- Crear un borrador, editarlo y comprobar su persistencia.
- Abrir `/admin/games`, crear una ficha, publicarla y comprobar `/juegos` y `/juegos/<slug>`.
- Comprobar `/juegos/azar` (debe redirigir 307 a una ficha publicada) y los filtros de plataforma, género y año.
- Probar subida de imagen solo después de confirmar el token/store del entorno.
- Verificar que una reseña muestra pros, contras, video y galería, y que el `<iframe>` del video carga (la CSP debe incluir `frame-src`).
- Verificar logs del deployment y errores de runtime.
- Confirmar que las variables no aparecen en logs o respuestas.

La publicación programada y la ejecución del endpoint de limpieza no deben darse por operativas hasta que exista un mecanismo programador configurado y probado.

## Scheduler

El scheduler vive en `.github/workflows/scheduled-jobs.yml` y no en Vercel Cron, porque el plan Hobby limita los cron jobs a una ejecución diaria. El workflow llama a `/api/revalidate` (cada 30 min), `/api/cron/cleanup` (04:17 UTC) y `/api/reconcile-storage` (04:47 UTC) con `Authorization: Bearer <CRON_SECRET>`. Los secretos `NETTI_SITE_URL` y `CRON_SECRET` se configuran en Settings → Secrets and variables → Actions. No configures un segundo scheduler para los mismos jobs.

Antes de darlo por operativo, ejecutá el workflow con `workflow_dispatch` y comprobá `cron_runs.last_run_at` y `last_success_at` para los tres jobs.

## Rollback

Si el deployment presenta errores:

1. Detener cambios de esquema y tareas programadas.
2. Revisar logs y variables del entorno sin copiar secretos.
3. Volver al deployment anterior desde el panel de Vercel si el problema es de aplicación.
4. Si hubo una migración incompatible, no ejecutar un rollback SQL improvisado: evaluar el cambio y restaurar primero en un entorno de prueba.
5. Registrar el incidente y la decisión de recuperación.

## Variables de entorno — inventario completo

| Variable                | Requerida                              | Uso y origen                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`          | Sí                                     | URL PostgreSQL pooled usada por el pool de la aplicación. Se obtiene desde el proyecto PostgreSQL/Neon; en producción debe ser la cadena pooled apropiada para el runtime.                                         |
| `DATABASE_URL_UNPOOLED` | Sí para el esquema de entorno validado | URL PostgreSQL directa, sin pooler. Se obtiene desde la consola del proveedor. Se usa para backup y migraciones; no se usa como pool de la aplicación.                                                             |
| `ADMIN_PASSWORD_HASH`   | Sí                                     | Hash scrypt, nunca contraseña en texto plano. Generarlo con `npm run hash:admin` y el flujo interactivo del script.                                                                                                |
| `BLOB_READ_WRITE_TOKEN` | Sí según `src/lib/env.ts`              | Token de lectura/escritura del store de Vercel Blob. Obtenerlo desde el store correspondiente.                                                                                                                     |
| `CRON_SECRET`           | Sí                                     | Secreto aleatorio de al menos 32 caracteres para los endpoints de cron, revalidación y reconciliación. También se usa como respaldo del HMAC de IP si `IP_HASH_SECRET` no está definida. Custodiarlo como secreto. |
| `IP_HASH_SECRET`        | No                                     | Secreto del HMAC que hashea las IPs de `login_attempts`. Si falta se usa `CRON_SECRET`; definirlo aparte permite rotar el cron sin reiniciar el rate limiting.                                                     |

### Variables opcionales o condicionales

| Variable                 | Estado                                            | Uso y origen                                                                                                                                  |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_SITE_URL`        | Opcional en desarrollo; obligatoria en producción | URL canónica del sitio. En producción debe ser una URL válida del sitio. Configurar en el entorno de despliegue.                              |
| `DATABASE_POOL_MAX`      | Opcional; predeterminado 2                        | Máximo de conexiones por instancia. El código acepta enteros de 1 a 10. Definirlo solo después de estimar el presupuesto total de conexiones. |
| `VERCEL_OIDC_TOKEN`      | Opcional en schema                                | Token OIDC provisto por Vercel cuando la integración/runtime lo habilita. El código actual no lo consume explícitamente.                      |
| `BLOB_STORE_ID`          | Opcional en schema                                | Identificador del store Blob. El código actual no lo consume explícitamente.                                                                  |
| `EDGE_CONFIG_ID`         | Opcional en schema                                | Identificador de Edge Config. No hay lectura/escritura de Edge Config implementada en el código actual.                                       |
| `IMAGES_PUBLIC_BASE_URL` | Opcional en schema                                | URL pública base de imágenes. No debe confundirse con el token de Blob; confirmar el uso antes de configurarla.                               |

### Variables operativas locales

| Variable                     | Requerida                            | Uso                                                                                                                                                                |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NETTI_RESTORE_DATABASE_URL` | Solo para restaurar                  | URL de una base local de pruebas. El script exige host loopback y nombre terminado en `_test`, `-test`, `_testing` o `-testing`. Nunca usar una URL de producción. |
| `AGE_PUBLIC_KEY`             | Solo si se cifra manualmente con age | Clave pública para cifrar backups antes de copiarlos a almacenamiento externo. No está validada ni consumida por la aplicación.                                    |
| `AGE_PRIVATE_KEY`            | Solo para descifrar                  | Clave privada que debe permanecer fuera del repositorio y de los logs. No está validada ni consumida por la aplicación.                                            |

## Reglas de seguridad

- No commitear `.env`, `.env.local`, dumps, claves ni archivos de credenciales.
- Mantener placeholders únicamente en `.env.example`.
- Usar variables separadas para desarrollo, preview y producción.
- Rotar cualquier secreto que haya sido expuesto y revisar los logs antes de compartirlos.
- Nunca imprimir URLs completas de conexión: contienen usuario y contraseña.
