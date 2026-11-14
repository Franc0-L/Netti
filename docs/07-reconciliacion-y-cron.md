# Reconciliación de Blob y Cursor del Cron — Netti

## 1. Contrato de almacenamiento (`lib/storage.ts`)

La definición completa de `Storage` vive en `01-stack-arquitectura.md` (§2.5). Incluye `put`, `del` y `list`. `@vercel/blob` expone `list` con `prefix` y `cursor`; confirmar en Fase 0 si `list` cuenta como operación avanzada.

## 2. Metadatos de imágenes — segundo paso

El upload solo recibe el archivo y devuelve los datos de la imagen. La UI exige `alt` y permite crédito y procedencia. Después de subir, el autor completa los metadatos en un segundo paso con `updateMedia` (`src/app/actions/media.ts`, esquema en `src/lib/validation.ts`).

La acción rechaza con `conflict` si `pending_delete_at` no es nulo. Después invalida los artículos y juegos que usan el medio. Sin esto, el `alt` y el crédito quedan viejos en caché.

`markMediaForDeletion` y `restoreMedia` viven en el mismo archivo. Marcar solo escribe `pending_delete_at`: el objeto se borra con el barrido de `/api/cron/cleanup` tras la ventana de gracia y solo si nada lo referencia. `isMediaReferenced` (`src/lib/media-references.ts`) es la única implementación de esa comprobación: cubre portada, Open Graph, galería y `media:<id>` en los cuerpos, y la usan tanto el panel como la reconciliación. No generar variantes por encima del ancho de la fuente (una imagen de 800 px no necesita variantes de 960/1600); eso baja las operaciones por subida.

## 3. Reconciliación de Blob

**Algoritmo `reconcileStorage()`**, un endpoint protegido con `CRON_SECRET`, acotado en tiempo y reanudable:

0. **Freno de seguridad**: contar cuántas filas se borrarían en el store. Si supera el 10 % de las claves totales, abortar y alertar. Independientemente, si existe una marca `backup_restored_at` en la fila de `cron_runs` con `job_name = 'backup_restore'` con fecha menor a 7 días, abortar y alertar. Nunca borrar masivamente tras un restore de backup.
1. **Purga de sesiones y intentos de login**: borrar `sessions` con `expires_at < now()` o `absolute_expires_at < now()`, y `login_attempts` con más de 7 días. En el runtime lo hace `/api/cron/cleanup` a diario; `reconcileStorage` repite la purga como red de seguridad.
2. **Sweep de marcados**: `media` con `pending_delete_at < now() - 24 h`. Re-verificar referencias con `isMediaReferenced` (cubre portada, Open Graph, galería y `media:<id>` con borde, así `media:1` no matchea `media:12`). Si hay referencia, limpiar la marca. Si no, `storage.del(clave + variantes)`; y solo si Blob confirma, borrar las filas. Si falla, registrar en `storage_orphans (action='delete', pending)` y dejar la marca.
3. **Huérfanos en el store**: `list` de `articles/` y `games/` contra `media.storage_key ∪ media_variants.storage_key`. Borrar lo que no está en DB **y** tenga `uploadedAt < now() - 1 h` (para no pisar subidas en curso); registrarlo como `repaired`.
4. **Faltantes** (en DB, no en el store): diseño con `status='failed'` y alerta. El runtime no implementa esta detección; los registros que no se pueden reparar quedan `pending` para el siguiente intento.
5. **Reintentos** de `storage_orphans` pendientes: los de `put` se resuelven si la clave ya está en `media`.
6. **Subidas abandonadas**: `media` de más de 7 días sin referencias → marcar `pending_delete_at`.
7. `last_success_at` solo si 0–6 terminaron sin excepción. El scheduler lo ejecuta a diario (04:47 UTC) en `.github/workflows/scheduled-jobs.yml`.

**Estado de implementación (`src/app/api/reconcile-storage/route.ts`):**

| Paso                               | Estado                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| 0. Freno por `backup_restored_at`  | Implementado (7 días, responde `409`)                                      |
| 1. Purga de sesiones e intentos    | Implementado (retención de 7 días)                                         |
| 2. Sweep de `pending_delete_at`    | Implementado (gracia de 24 h, regex con borde, compensación en orphans)    |
| 3. Huérfanos por `list` del store  | Pendiente: requiere credenciales de Blob y medición de operaciones         |
| 4. Faltantes en el store           | Pendiente: depende del listado                                             |
| 5. Reintentos de `storage_orphans` | Implementado (lote de 50)                                                  |
| 6. Subidas abandonadas             | Pendiente                                                                  |
| 7. `last_success_at`               | Implementado: solo avanza si no hubo fallos de Blob ni borrados pendientes |

La comprobación de referencias del paso 2 no se duplica en la ruta: importa `isMediaReferenced`, la misma función que usa el panel, para que un medio que la galería o el cuerpo referencian no se borre por error.

El endpoint devuelve `500` con `ok: false` si algo falla y conserva `last_success_at`; solo lo avanza en una ejecución limpia. El cron de GitHub falla con el código de la respuesta, así que un error no pasa desapercibido.

El freno del 10 % sobre claves totales no aplica todavía porque no se listan claves del store.

## 4. Cursor del cron (`POST /api/revalidate`)

**Mitigación de CU-horas**: cada ejecución despierta Neon. Para evitar 48 despertares al día (~30 CU-h/mes solo en cómputo de arranque), el endpoint usa un reloj de aplicación (disponible sin consultar Neon) para decidir si hay trabajo, y solo consulta Neon cuando el almacén barato indica que corresponde revisar publicaciones.

**Alimentación de `next_due`**: cada acción que cambie la visibilidad de un artículo (`createArticle`, `publishArticle`, `unpublishArticle`, `trashArticle`, `restoreArticle`, `updateArticle` si cambia `published_at` o elimina un artículo programado) recalcula `next_due` tras el `COMMIT` y lo escribe en el almacén barato (Edge Config de Vercel o JSON en Blob). Escribir `next_due` conservador (por ejemplo `now`) _antes_ del `COMMIT` y corregirlo después evita leer `cron_runs` en cada ejecución del cron.

```
0. Bearer con timingSafeEqual → 401
1. ahora = reloj de la aplicación (Date.now() del entorno serverless, sin Neon)
2. next_due = leer de Edge Config / Blob JSON (almacén barato, sin Neon)
   si next_due es null o next_due > ahora → retornar { revalidado: 0, cursor: ahora }
   (no hay nada que activar aún; no se toca Postgres)
3. t0 = select now()  -- reloj de la base, solo si el almacén barato indica trabajo pendiente
4. cur = (cron_runs.last_published_at, cron_runs.last_id) ?? (t0 - 24 h, 0)
5. update cron_runs set last_run_at = t0
6. due = articles where status='published' and published_at <= t0 and (published_at, id) > cur
       order by published_at, id limit 200    -- usa articles_pending_activation_idx
7. por fila: affectedTags(null, estado(fila)) → revalidateTag(tag, { expire: 0 })
8. si due.length == 200 → continuar iterando con cur = (published_at, id) de la última fila procesada
   hasta que due.length < 200 o se alcance el presupuesto de tiempo
9. si due.length > 0 → cursor = (published_at, id) de la última fila del lote procesado
   si due.length == 0 → no se actualiza el cursor (no hubo nada que procesar)
10. update cron_runs set last_published_at = cursor[0], last_id = cursor[1]   -- tras cada lote con datos, no al final de todo
11. escribir next_due en Edge Config / Blob JSON (próximo published_at pendiente o null)
12. return { revalidado, cursor }
```

**Nota sobre `next_due`**: cada acción de publicación escribe `next_due` en el almacén barato antes del `COMMIT`. Si el write falla, el cron corre de más, no de menos, y consulta Neon directamente como fallback seguro.

**Costo de operaciones de `next_due`**: leer el almacén barato cada 30 minutos suma ~43.200 lecturas al mes (más de 10.000 operaciones simples de Blob o lecturas de Edge Config). Escribir `next_due` cada vez que se publica suma escrituras adicionales. Fase 0 debe medir si Edge Config o Blob JSON es más barato para este uso.

**Señal de restauración de backup**: una operación de restore de backup escrita en Postgres registra `backup_restored_at = now()` en la fila de `cron_runs` con `job_name = 'backup_restore'` inmediatamente después de terminar la restauración y antes de habilitar la reconciliación. El freno de seguridad del paso 0 comprueba: si `backup_restored_at > ahora - 7 días`, aborta la reconciliación. **Implementado** en `scripts/restore-db.ts`: si la marca no se puede escribir, el script termina con error y no anuncia la restauración como protegida.

**Si el almacén barato no está disponible**: el cron consulta Neon directamente como fallback, sin usar `next_due`.

El cursor usa la tupla `(published_at, id)` para no omitir filas cuando varias comparten el mismo `published_at` en el borde del lote.

Además del cursor monotónico, la ruta revisa una **ventana de solapamiento** de la última hora (`OVERLAP_WINDOW_MS`) con `updated_at`, en lotes de 100. Sin ella, una fila insertada directamente en PostgreSQL con una fecha ya pasada, o movida hacia atrás, nunca se activaría. La ventana revalida esas filas sin retroceder el cursor.

No hace falta lock: dos ejecuciones solapadas revalidan dos veces y es idempotente. No uses `pg_try_advisory_lock` de sesión: el pooler de Neon (modo transacción) lo rompe; solo `xact` es seguro.

**Estado de implementación (`src/app/api/revalidate/route.ts`):** se implementaron los pasos 0, 1, 3–10 y 12. El diseño de `next_due` en Edge Config/Blob (pasos 2 y 11) no está implementado: cada ejecución consulta `cron_runs` y `articles` directamente. Es correcto y reanudable, pero despierta Neon en cada corrida; el almacén barato queda como optimización de CU-horas a medir en Fase 0.

**Scheduler:** `.github/workflows/scheduled-jobs.yml` ejecuta `POST /api/revalidate` cada 30 minutos, `GET /api/cron/cleanup` a las 04:17 UTC y `POST /api/reconcile-storage` a las 04:47 UTC. Requiere los secretos `NETTI_SITE_URL` y `CRON_SECRET` en GitHub. No debe existir un segundo scheduler para los mismos jobs.
