# Variables de entorno

Este inventario refleja el código de la rama actual. No contiene valores reales. Para conocer los valores locales, copiá `.env.example` a `.env.local` y completá los placeholders de forma segura.

## Variables requeridas por la aplicación

| Variable | Requerida | Uso y origen |
| --- | --- | --- |
| `DATABASE_URL` | Sí | URL PostgreSQL pooled usada por el pool de la aplicación. Se obtiene desde el proyecto PostgreSQL/Neon; en producción debe ser la cadena pooled apropiada para el runtime. |
| `DATABASE_URL_UNPOOLED` | Sí para el esquema de entorno validado | URL PostgreSQL directa, sin pooler. Se obtiene desde la consola del proveedor. Se usa para backup y migraciones; no se usa como pool de la aplicación. |
| `ADMIN_PASSWORD_HASH` | Sí | Hash scrypt, nunca contraseña en texto plano. Generarlo con `npm run hash:admin` y el flujo interactivo del script. |
| `BLOB_READ_WRITE_TOKEN` | Sí según `src/lib/env.ts` | Token de lectura/escritura del store de Vercel Blob. Obtenerlo desde el store correspondiente. Aunque Vercel puede ofrecer mecanismos OIDC en ciertos contextos, el schema actual exige esta variable; no asumir que OIDC la reemplaza sin cambiar y validar el código. |
| `CRON_SECRET` | Sí | Secreto aleatorio de al menos 32 caracteres para el endpoint de limpieza. También se usa como clave HMAC para derivar el hash de IP de los intentos de login. Generarlo con un generador criptográficamente seguro y custodiarlo como secreto. |

## Variables opcionales o condicionales

| Variable | Estado | Uso y origen |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | Opcional en desarrollo; obligatoria en producción | URL canónica del sitio. En producción debe ser una URL válida del sitio. Configurar en el entorno de despliegue. |
| `DATABASE_POOL_MAX` | Opcional; predeterminado 2 | Máximo de conexiones por instancia. El código acepta enteros de 1 a 10. Definirlo solo después de estimar el presupuesto total de conexiones. |
| `VERCEL_OIDC_TOKEN` | Opcional en schema | Token OIDC provisto por Vercel cuando la integración/runtime lo habilita. El código actual no lo consume explícitamente. |
| `BLOB_STORE_ID` | Opcional en schema | Identificador del store Blob. El código actual no lo consume explícitamente. |
| `EDGE_CONFIG_ID` | Opcional en schema | Identificador de Edge Config. No hay lectura/escritura de Edge Config implementada en el código actual. |
| `IMAGES_PUBLIC_BASE_URL` | Opcional en schema | URL pública base de imágenes. No debe confundirse con el token de Blob; confirmar el uso antes de configurarla. |

## Variables operativas locales

| Variable | Requerida | Uso |
| --- | --- | --- |
| `NETTI_RESTORE_DATABASE_URL` | Solo para restaurar | URL de una base local de pruebas. El script exige host loopback y nombre terminado en `_test`, `-test`, `_testing` o `-testing`. Nunca usar una URL de producción. |
| `AGE_PUBLIC_KEY` | Solo si se cifra manualmente con age | Clave pública para cifrar backups antes de copiarlos a almacenamiento externo. No está validada ni consumida por la aplicación. |
| `AGE_PRIVATE_KEY` | Solo para descifrar | Clave privada que debe permanecer fuera del repositorio y de los logs. No está validada ni consumida por la aplicación. |

## Variables administradas por la plataforma

- `NODE_ENV`: Next.js/Node la define según el entorno. No fijarla manualmente para simular producción local sin comprender sus efectos.
- `VERCEL` y variables propias de Vercel: las define la plataforma; no son requisitos explícitos del schema de Netti.

## Diferencias con documentación anterior

Algunos documentos operativos previos describen `IP_HASH_SECRET`, `PREVIEW_ORIGIN_REGEX`, `AGE_PUBLIC_KEY` como variable requerida, o un uso de OIDC que sustituye el token Blob. Esas afirmaciones no coinciden con el schema/código actual: el hash de IP usa `CRON_SECRET`, no se encontró uso de `PREVIEW_ORIGIN_REGEX`, `age` es una operación manual opcional y `BLOB_READ_WRITE_TOKEN` sigue siendo obligatorio en `src/lib/env.ts`.

Además, `drizzle.config.ts` usa `DATABASE_URL_UNPOOLED` para que las migraciones no dependan del pooler. El comando de migración lee esa variable; la aplicación sigue usando `DATABASE_URL` para su pool.

## Reglas de seguridad

- No commitear `.env`, `.env.local`, dumps, claves ni archivos de credenciales.
- Mantener placeholders únicamente en `.env.example`.
- Usar variables separadas para desarrollo, preview y producción.
- Rotar cualquier secreto que haya sido expuesto y revisar los logs antes de compartirlos.
- Nunca imprimir URLs completas de conexión: contienen usuario y contraseña.
