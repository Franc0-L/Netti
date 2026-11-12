# Contrato de Acciones y Endpoints — Netti

El panel no necesita una API REST: tiene un solo cliente escrito por la misma persona. Las mutaciones son **Server Actions**; los Route Handlers quedan solo donde hace falta HTTP real (subida de archivos y cron).

## 1. Por qué Server Actions

| Necesidad                       | Server Action           | Route Handler                       |
| ------------------------------- | ----------------------- | ----------------------------------- |
| Lectura inmediata tras escribir | `updateTag`             | `revalidateTag(tag, { expire: 0 })` |
| Verificación de origen          | Resuelta contra el host | Manual                              |
| Tipado de punta a punta         | Nativo                  | Duplicado                           |
| Subida de archivos de 2 MB      | Límite de body chico    | Sin problema                        |

Con Server Actions desaparece el contrato de 300 líneas que antes describía `/api/content`. El panel importa la acción y recibe un resultado tipado.

**Toda acción exportada, salvo `login` y `logout`**, empieza con `requireSession()` y `assertSameOrigin()`. Ninguna confía en el proxy.

## 2. Resultado uniforme

```ts
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | 'unauthorized'
        | 'forbidden'
        | 'invalid'
        | 'conflict'
        | 'not_found'
        | 'rate_limited'
        | 'too_large'
        | 'server';
      message: string;
      fieldErrors?: Record<string, string[]>;
      current?: unknown;
      retryAfter?: number;
    };
```

Los componentes leen `result.ok` y muestran `message` o `fieldErrors`. No hay códigos HTTP que interpretar, salvo en los Route Handlers.

## 3. Autenticación

### `login({ password })`

```ts
'use server';
export async function login(input: {
  password: string;
}): Promise<ActionResult<{ expiresAt: string }>>;
```

Orden de ejecución: `assertSameOrigin()` → rate limit por IP → `scrypt` asíncrono → `timingSafeEqual` → crear sesión → setear cookie.

| Resultado             | `code`         | `message`                                                      |
| --------------------- | -------------- | -------------------------------------------------------------- |
| Cookie emitida        | — (`ok: true`) | —                                                              |
| Contraseña incorrecta | `unauthorized` | "La contraseña no es correcta."                                |
| Demasiados intentos   | `rate_limited` | "Demasiados intentos. Probá en unos minutos." con `retryAfter` |
| Origen ajeno          | `forbidden`    | "Origen no permitido."                                         |
| Falta configuración   | `server`       | "El panel no está configurado."                                |

La cookie se emite dentro de la acción con `cookies()` (async en Next 16):

```ts
const cookieStore = await cookies();
cookieStore.set('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60, // 30 días: el tope absoluto de la sesión
});
```

`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` de 30 días (tope absoluto de la sesión). La renovación deslizante de 8 horas se gestiona en el servidor mediante `sessions.expires_at`, no mediante la cookie.

### `logout()`

Borra la fila de `sessions` y la cookie. Idempotente.

### `logoutAll()`

`TRUNCATE sessions`. Cierra todas las sesiones, incluida la actual.

## 4. Contenido

### 4.0 Una escritura, una transacción

Actualizar el artículo e insertar su revisión son **una sola transacción**. Si se hacen por separado, una desconexión entre ambas deja el artículo guardado sin snapshot o un snapshot de algo que nunca se guardó. La invalidación de caché va **después del `COMMIT`**: invalidar antes de confirmar publica un estado que puede revertirse.

```ts
await db.transaction(async (tx) => {
  const [row] = await tx
    .update(articles)
    .set(values)
    .where(and(eq(articles.id, id), eq(articles.version, version)))
    .returning(); // fila completa (sin search_vector)

  if (!row) throw new StaleVersion();

  await tx.insert(articleRevisions).values({
    articleId: id,
    version: row.version,
    snapshot: row, // fila completa de RETURNING *, sin search_vector
  });
});
```

El trigger `BEFORE UPDATE` incrementa `version` y fija `updated_at`. `RETURNING` ve los valores **después** del trigger, así que devuelve la versión nueva sin un `SELECT` extra y sin incrementar dos veces. Si la fila no cambió (misma versión devuelta), no se inserta una revisión duplicada. Si `rowCount = 0`, se consulta la fila para distinguir `not_found` de `conflict`.

### `createArticle(input)`

```ts
async function createArticle(
  input: ArticleInput
): Promise<ActionResult<{ id: number; version: number; slug: string }>>;
```

- `status: "draft"` → guarda lo que haya. Un borrador puede estar vacío salvo `kind`.
- `status: "published"` → valida completitud; si falta `publishedAt`, el servidor pone `now()`.

| `code`     | Cuándo                                             |
| ---------- | -------------------------------------------------- |
| `invalid`  | Zod falló; `fieldErrors` trae el detalle por campo |
| `conflict` | El slug ya existe para ese `kind`                  |
| `server`   | Error de base                                      |

**Validación de medios**: antes de insertar, verificar que `coverMediaId` y `ogMediaId` (si se proporcionan) existan en `media` y que `pending_delete_at` sea nulo. También verificar que cualquier referencia `media:<id>` en el cuerpo apunte a medios existentes y sin marca de purga. Si algún medio está marcado para borrado o no existe, devolver `conflict` con `fieldErrors.coverMediaId` o `fieldErrors.ogMediaId` según corresponda.

### `updateArticle({ id, version, input })`

```ts
async function updateArticle(args: {
  id: number;
  version: number;
  input: ArticleInput;
}): Promise<
  ActionResult<{ version: number; slug: string; status: ContentStatus; oldSlug?: string }>
>;
```

Ejecuta la transacción de §4.0: `UPDATE ... WHERE id = $id AND version = $version RETURNING version` + `INSERT` en `article_revisions`. Si no devuelve fila, hace un `SELECT` para distinguir:

| Situación              | `code`      | Extra                          |
| ---------------------- | ----------- | ------------------------------ |
| No existe              | `not_found` | —                              |
| Versión desactualizada | `conflict`  | `current` con el estado actual |
| Slug ocupado           | `conflict`  | `fieldErrors.slug`             |

**Cambio de slug**: si `input.slug` difiere del slug actual **y el artículo ya estaba publicado** (`published_at` no nulo), dentro de la misma transacción se inserta una redirección. Las rutas públicas usan prefijos por colección (definidos en `lib/routes.ts`):

```ts
const [existing] = await tx
  .select({
    publishedAt: articles.publishedAt,
    status: articles.status,
    previousStatus: articles.previousStatus,
    slug: articles.slug,
    kind: articles.kind,
  })
  .from(articles)
  .where(eq(articles.id, id))
  .limit(1)
  .forUpdate();

const oldSlug = existing.slug;
const kind = existing.kind;
const wasPublished = existing.status === 'published';

if (input.slug !== oldSlug) {
  await tx.delete(redirects).where(eq(redirects.fromPath, articlePath(kind, oldSlug)));
  await tx.delete(redirects).where(eq(redirects.fromPath, articlePath(kind, input.slug)));

  if (wasPublished) {
    await tx.savepoint('redirect_insert');
    try {
      await tx.insert(redirects).values({
        fromPath: articlePath(kind, oldSlug),
        toPath: articlePath(kind, input.slug),
        statusCode: 308,
      });
      await tx.releaseSavepoint('redirect_insert');
    } catch (error) {
      if (!isUniqueViolation(error, 'redirects_from_path_key')) throw error;
      await tx.rollbackToSavepoint('redirect_insert');
      throw new SlugRedirectConflict();
    }
  }
}
```

**Validación de medios**: verificar que `coverMediaId` y `ogMediaId` (si se proporcionan y difieren de los previos) existan en `media` y que `pending_delete_at` sea nulo. También verificar que cualquier referencia `media:<id>` en el cuerpo apunte a medios existentes y sin marca de purga. Si algún medio está marcado para borrado o no existe, devolver `conflict`.

La función `articlePath(kind, slug)` vive en `lib/routes.ts`, no en `app/actions/`, porque las funciones `"use server"` solo pueden exportar funciones async.

**Cambio de estado**: `updateArticle` no permite cambiar `status` ni `kind`. Si el `input.status` o `input.kind` difieren del actual, devuelve `conflict`. Para publicar usa `publishArticle`; para despublicar usa `unpublishArticle`; el `kind` se define al crear y no se modifica después.

**Editar una entrada publicada**: guardar cambios **no la despublica**. Mantiene `status = 'published'` y revalida.

### `publishArticle({ id, version })`

`draft` → `published`. Valida completitud del contenido; si falta `publishedAt`, el servidor pone `now()`. Si `published_at` es futuro, queda programado.

```ts
async function publishArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number; slug: string; status: 'published' }>>;
```

Invalidación: `article:<kind>:<slug>`, `kind:<kind>`, `articles`, `home`, `redirects`.

### `unpublishArticle({ id, version })`

`published` → `draft`. Conserva `published_at` para no perder la fecha original. Revalida.

```ts
async function unpublishArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number; status: 'draft' }>>;
```

Invalidación: `article:<kind>:<slug>`, `kind:<kind>`, `articles`, `home`, `redirects`.

### `trashArticle({ id, version })`

`published` o `draft` → `trashed`. Guarda `previous_status` y `trashed_at`, pone `status = 'trashed'`. Libera el slug (índice parcial). No borra imágenes.

```ts
async function trashArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number; status: 'trashed' }>>;
```

Invalidación: `article:<kind>:<slug>`, `kind:<kind>`, `articles`, `home` si estaba publicado o destacado, `tag:<t>` para cada etiqueta previa, `redirects`.

### `restoreArticle({ id, version })`

Vuelve a `previous_status` y limpia `trashed_at`. **No hay pre-chequeo**: comprobar si el slug está libre antes del `UPDATE` es una condición de carrera. Se intenta el `UPDATE` y se captura la violación de unicidad.

```ts
async function restoreArticle(args: {
  id: number;
  version: number;
}): Promise<ActionResult<{ version: number; status: ContentStatus; slug: string }>>;
```

Dos detalles que un `catch (23505)` genérico no resuelve:

1. **Identificar la restricción.** Solo se trata como conflicto de slug si el error corresponde a `articles_kind_slug_active`. Un `23505` de otra restricción es un error real y no debe convertirse en "elegí otro slug".
2. **Reintentar hasta encontrar un sufijo libre.** Se prueba primero el slug original. Si está ocupado, se prueban `-2`, `-3`, … hasta un límite (10); si ninguno sirve, se devuelve `conflict` sin sugerencia.

Cada intento debe ejecutarse en una **transacción independiente** o usar un `SAVEPOINT` con rollback ante el conflicto. Si una violación de unicidad ocurre dentro de una transacción PostgreSQL, esa transacción queda abortada y no se puede continuar con otro `UPDATE` dentro de ella.

```ts
try {
  return await restoreWithSlug(id, slug); // UPDATE ... RETURNING
} catch (error) {
  if (!isUniqueViolation(error, 'articles_kind_slug_active')) throw error;
}

for (let attempt = 2; attempt <= 10; attempt++) {
  const candidate = `${slug}-${attempt}`;
  try {
    return await restoreWithSlug(id, candidate); // UPDATE ... RETURNING en transacción nueva o savepoint
  } catch (error) {
    if (!isUniqueViolation(error, 'articles_kind_slug_active')) throw error;
  }
}

return { ok: false, code: 'conflict', message: 'No se pudo liberar el slug.' };
```

Cada reintento es un `UPDATE`; el que gana es el que la base acepta. El resultado exitoso incluye el slug definitivo para que el panel lo muestre.

**No crear redirección desde el slug original.** Si el slug original ya lo ocupa otro artículo (porque se creó tras el borrado), no se crea ninguna redirección. Crearla apropiaría la URL del artículo nuevo. El panel muestra el slug definitivo y el autor decide si actualiza enlaces internos manualmente.

Invalidación: `article:<kind>:<slug-original>`, `article:<kind>:<slug-definitivo>`, `kind:<kind>`, `articles`, `home` si el estado restaurado es publicado o destacado, `redirects`.

### `purgeArticle({ id, version, confirmSlug })`

Borrado definitivo. Exige `status = 'trashed'` y escribir el slug para confirmar.

```ts
async function purgeArticle(args: {
  id: number;
  version: number;
  confirmSlug: string;
}): Promise<ActionResult<{ version: number }>>;
```

**Orden mark-and-sweep** (Postgres y Blob no comparten transacción):

1. En una transacción: recolectar los ids de medios que solo referencia este artículo o juego (comprobando `cover_media_id` y `og_media_id` en `articles`, `cover_media_id` en `games`, referencias `media:<id>` en `articles.body` y `games.body`, y descartando `media_variants.media_id` que es una FK interna con borrado en cascada, no una referencia externa). Borrar la fila del artículo o juego (la FK `ON DELETE RESTRICT` protege `media` si aún se usa como `cover_media_id`/`og_media_id`), y recién entonces marcar `pending_delete_at` en los medios huérfanos (las revisiones caen por `ON DELETE CASCADE`).
2. Fuera de la transacción: borrar en Blob el objeto y sus variantes.
3. Solo si Blob confirma: borrar las filas de `media` y `media_variants`.

Si el paso 2 falla, la fila queda marcada y un barrido de baja frecuencia reintenta. Nunca se borra el objeto antes de confirmar la base: eso deja referencias rotas que no se pueden reparar. Las imágenes referenciadas por otro artículo no se marcan.

Invalidación: `article:<kind>:<slug>`, `kind:<kind>`, `articles`, `home` si estaba publicado o destacado, `tag:<t>` para cada etiqueta previa, `redirects` (borra las que apuntan a este artículo).

**`next_due`**: tras el `COMMIT`, recalcular el próximo `published_at` pendiente y escribirlo en el almacén barato (Edge Config / Blob JSON) para que el cron no despierte Neon innecesariamente. Las acciones que deben mantenerlo actualizado son: `createArticle`, `publishArticle`, `unpublishArticle`, `trashArticle`, `restoreArticle`, `updateArticle` (si cambia `published_at`) y la eliminación definitiva de artículos programados. Escribir `next_due` conservador (por ejemplo `now`) antes del `COMMIT` y corregirlo después; si el write al almacén barato falla, el cron corre de más, no de menos, y consulta Neon directamente como fallback seguro.

### `revalidateArticle({ id })`

Revalida un artículo específico desde el panel (runbook de monitoreo). Lee el artículo y revalida sus tags.

```ts
async function revalidateArticle(args: { id: number }): Promise<ActionResult<{ tags: string[] }>>;
```

### `searchGames({ q, limit })`

Lectura para el autocompletado. Usa `pg_trgm`, no `tsvector` (los prefijos de dos letras no funcionan con full-text).

```ts
export type GameSuggestion = {
  id: number;
  slug: string;
  title: string;
  status: ContentStatus;
};
export async function searchGames(args: {
  q: string;
  limit?: number;
}): Promise<ActionResult<GameSuggestion[]>>;
```

- `q` recortada, mínimo 2 caracteres, `limit` 8 por defecto y 20 máximo, escapando `%`, `_` y `\`.
- Incluye borradores (la UI los marca).
- `publishArticle` de una reseña exige `games.status = 'published'`, o la ficha enlazada daría 404.

## 5. CRUD de juegos

Todas con `requireSession()` + `assertSameOrigin()`.

```ts
export async function createGame(
  input: GameInput
): Promise<ActionResult<{ id: number; version: number; slug: string }>>;
export async function updateGame(args: {
  id: number;
  version: number;
  input: GameInput;
}): Promise<ActionResult<{ version: number; slug: string }>>;
export async function deleteGame(args: {
  id: number;
  version: number;
}): Promise<ActionResult<undefined>>;
export async function getGame(
  id: number
): Promise<ActionResult<{ game: GameRecord; version: number }>>;
export async function listGames(args?: {
  q?: string;
  status?: 'draft' | 'published';
  limit?: number;
  cursor?: number;
}): Promise<ActionResult<{ items: GameListItem[]; nextCursor: number | null }>>;
```

**Reglas:**

- **Conflictos**: slug duplicado (`games_slug_key`) → `conflict` con `fieldErrors.slug`. `deleteGame` con reseñas asociadas (`23503`) → `conflict` "Tiene reseñas asociadas".
- **Cambio de slug** de una ficha publicada: misma regla que artículos (borrar redirección de la ruta nueva, insertar la vieja), con `gamePath(slug)` en `lib/routes.ts`.
- **Invalidación**: `game:<id>`, `kind:game`, y las reseñas asociadas (`select kind, slug from articles where game_id = $1` → `article:review:<slug>` y `kind:review`), porque la reseña muestra título y portada del juego.
- `updateGame` sí acepta `status` en el input (no hay programación ni "guardar no publica" en juegos).

## 6. Búsqueda del panel

```ts
export type ArticleListItem = {
  id: number;
  kind: ArticleKind;
  slug: string;
  title: string;
  status: ContentStatus;
  publishedAt: string | null;
  scheduled: boolean;
  featured: boolean;
  updatedAt: string;
  version: number;
};
export async function searchArticles(args: {
  q?: string;
  kind?: ArticleKind;
  status?: ContentStatus;
  limit?: number;
  cursor?: number;
}): Promise<ActionResult<{ items: ArticleListItem[]; nextCursor: number | null }>>;
```

- Sin `q`: `order by id desc`, `where id < cursor`, `limit` 30 por defecto y 100 máximo.
- Con `q`: `search_vector @@ websearch_to_tsquery('es_unaccent', q)` ordenado por `ts_rank_cd desc, id desc` y `nextCursor: null` (un cursor numérico no sirve para ranking).
- Sin `status`, excluye `trashed`.
- `/buscar` con consulta libre usa el índice estático cacheado (títulos, descripción, etiquetas) buscado en el cliente, normalizando tildes. El full-text de Postgres queda para el panel.

## 7. Revisiones

Una revisión por cada escritura efectiva sobre `articles` (si el trigger no sube `version`, no se inserta nada).

| Operación                                                                                   |       ¿Snapshot?        |
| ------------------------------------------------------------------------------------------- | :---------------------: |
| Crear (v1), guardar cambios, publicar, despublicar, papelera, restaurar, restaurar revisión |           Sí            |
| Purgar                                                                                      | No (caen por `CASCADE`) |

Snapshot = fila completa de `RETURNING *` sin `search_vector`. Retención inline, en la misma transacción: `delete from article_revisions where article_id = $1 and version <= $2 - 20`. Sin cron.

```ts
export async function listRevisions(args: {
  articleId: number;
}): Promise<ActionResult<Array<{ version: number; createdAt: string }>>>;
export async function getRevision(args: {
  articleId: number;
  version: number;
}): Promise<ActionResult<{ snapshot: unknown }>>;
export async function restoreRevision(args: {
  id: number;
  version: number;
  revisionVersion: number;
}): Promise<ActionResult<{ version: number }>>;
```

`restoreRevision` restaura solo contenido (título, descripción, cuerpo, etiquetas, portada, og, SEO, campos de reseña/noticia, autor). **No** restaura `slug`, `status`, `publishedAt`, `featured` ni `kind`. Pasa por Zod.

## 8. Metadatos y biblioteca de imágenes

```ts
export type MediaListItem = {
  id: number;
  publicUrl: string;
  width: number;
  height: number;
  alt: string | null;
  rights: 'own' | 'press' | 'third_party';
  createdAt: string;
  referenced: boolean;
};
export async function listMedia(args?: {
  limit?: number;
  cursor?: number;
  unusedOnly?: boolean;
}): Promise<ActionResult<{ items: MediaListItem[]; nextCursor: number | null }>>;
export async function deleteMedia(args: { mediaId: number }): Promise<ActionResult<undefined>>;
```

- `deleteMedia` devuelve `conflict` si el medio está referenciado (portada, OG o `media:<id>` en algún cuerpo). Si no está referenciado, marca `pending_delete_at`.

### `updateMediaMetadata({ mediaId, alt, credit, rights, sourceUrl })`

Actualiza metadatos de una imagen ya subida. Rechaza con `conflict` si `pending_delete_at` no es nulo. Invalida los artículos que usan el medio: `cover_media_id = $1 OR og_media_id = $1 OR body ~ ('media:' || $1 || '([^0-9]|$)')`, más juegos con esa portada.

```ts
export async function updateMediaMetadata(args: {
  mediaId: number;
  alt: string;
  credit?: string | null;
  rights: 'own' | 'press' | 'third_party';
  sourceUrl?: string | null;
}): Promise<ActionResult<{ mediaId: number }>>;
```

- `media.alt` es el alt base del medio en la biblioteca. `articles.cover_alt` (y `games.cover_alt`) es una sobreescritura opcional solo cuando el medio se usa como portada de ese artículo/juego.

## 6. Route Handlers

### 5.1 `POST /api/upload`

Es el único lugar donde el navegador manda bytes.

```http
POST /api/upload
Content-Type: multipart/form-data

file=<binario>
kind=review            # uno de: review, news, guide, game. Determina el prefijo de la clave (articles/ o games/)
```

El parámetro `kind` acepta exactamente cuatro valores:

| `kind`   | Prefijo de clave en Blob | Uso             |
| -------- | ------------------------ | --------------- |
| `review` | `articles/`              | Reseña de juego |
| `news`   | `articles/`              | Noticia         |
| `guide`  | `articles/`              | Guía            |
| `game`   | `games/`                 | Ficha de juego  |

El servidor valida una whitelist estricta y resuelve el prefijo internamente. El cliente no puede enviar un prefijo de almacenamiento arbitrario.

Validaciones, en orden:

1. Sesión válida → `401`.
2. Origen permitido → `403`.
3. `Content-Length <= 2 MB + margen` → `413` antes de leer el cuerpo. Es una optimización, **no la defensa**: el header puede faltar o mentir.
4. Leer el `File` y comprobar el **tamaño real** ≤ 2 MB y que el cuerpo total no supere el presupuesto (2 MB + 64 KB de formulario).
5. MIME declarado en la allowlist → `400`.
6. Magic numbers del contenido real → `400`.
7. Dimensiones decodificadas y megapíxeles ≤ 20 → `400`.
8. `sharp`: re-encodeo a WebP, lado mayor ≤ 2560 px, sin EXIF.
9. Variantes 480 / 960 / 1600 px, solo si son menores al ancho de la imagen fuente (una imagen de 800 px no genera variantes de 960 ni 1600).

La respuesta:

```json
{
  "ok": true,
  "media": {
    "id": 12,
    "url": "https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/articles/8f3c1a2e.webp",
    "width": 1600,
    "height": 900,
    "bytes": 184320,
    "variants": [
      {
        "width": 480,
        "url": "https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/articles/8f3c1a2e-480.webp"
      },
      {
        "width": 960,
        "url": "https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/articles/8f3c1a2e-960.webp"
      },
      {
        "width": 1600,
        "url": "https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/articles/8f3c1a2e-1600.webp"
      }
    ]
  }
}
```

| Código | Cuerpo                                                            |
| ------ | ----------------------------------------------------------------- |
| 400    | `{ "error": "Formato no admitido. Usá JPEG, PNG, WebP o AVIF." }` |
| 400    | `{ "error": "El archivo no coincide con su tipo declarado." }`    |
| 400    | `{ "error": "Las imágenes animadas no están soportadas." }`       |
| 400    | `{ "error": "La imagen supera el tamaño de píxeles permitido." }` |
| 413    | `{ "error": "La imagen no puede superar los 2 MB." }`             |
| 500    | `{ "error": "No se pudo guardar la imagen." }`                    |

La subida pasa por `@vercel/blob` (`put`) desde el servidor. El token se resuelve con OIDC en Vercel; en desarrollo local se usa `BLOB_READ_WRITE_TOKEN`.

La clave del objeto es `articles/<uuid>.webp` o `games/<uuid>.webp`: nunca el nombre original ni el slug. Se guarda con `cacheControlMaxAge: 31536000` (caché larga; el contenido nunca cambia porque la clave lleva UUID).

**Compensación de subida.** Si falla el `INSERT` en `media` tras subir a Blob, se intenta borrar los objetos de Blob y se registra la clave en un mecanismo de reconciliación para limpieza posterior. No hay transacción distribuida.

### 5.2 `POST /api/revalidate`

Lo llama `.github/workflows/scheduled-jobs.yml` cada 30 minutos. No lo usa el panel.

```http
POST /api/revalidate
Authorization: Bearer $CRON_SECRET
```

```json
{
  "ok": true,
  "revalidated": 1,
  "tags": ["article:news:mi-noticia", "kind:news", "articles"],
  "cursor": { "publishedAt": "2026-11-11T12:00:00.000Z", "id": 42 },
  "more": false
}
```

Si `CRON_SECRET` falta o no coincide: `401`. El endpoint agrupa los tags afectados y llama a `revalidateTag(tag, { expire: 0 })` para forzar un miss en la próxima lectura. Usa un cursor `(published_at, id)` persistido en `cron_runs`, así que es idempotente y reanudable: si hay más de 200 artículos pendientes devuelve `more: true` para la siguiente corrida.

### 5.3 `GET /api/health` y `GET /api/ready`

Son dos comprobaciones distintas y no intercambiables.

| Endpoint      | Qué prueba                         | Toca Postgres          | Autenticación         | Frecuencia                              |
| ------------- | ---------------------------------- | ---------------------- | --------------------- | --------------------------------------- |
| `/api/health` | _Liveness_: el proceso responde    | No                     | No                    | Cada 1–5 min (uptime monitor)           |
| `/api/ready`  | _Readiness_: DB y Blob alcanzables | Sí (`select 1` + Blob) | `Bearer $CRON_SECRET` | Cada 30–60 min, o solo desde el runbook |

`/api/health` devuelve `200` con `Cache-Control: no-store`:

```json
{ "status": "ok", "service": "netti", "checkedAt": "2026-11-11T09:08:23.872Z" }
```

No consulta la base ni Blob: un health que toca Neon la despierta y consume CU-horas.

`/api/ready` devuelve `401` sin credenciales y, con credenciales, el estado por dependencia:

```json
{
  "status": "ok",
  "service": "netti",
  "checkedAt": "2026-11-11T09:10:00.000Z",
  "dependencies": { "database": "ok", "blob": "ok" }
}
```

`status` es `ok`, `degraded` (algún componente omitido, por ejemplo Blob sin token) o `unhealthy` (`503`, algún componente falló).

### 5.4 `POST /api/reconcile-storage`

Endpoint protegido con `CRON_SECRET` que ejecuta la parte segura de la reconciliación basada en la base: purga sesiones expiradas e intentos viejos, reintenta orphans registrados y barre medios marcados para borrar tras el período de gracia. No lista el store completo de Blob.

```http
POST /api/reconcile-storage
Authorization: Bearer $CRON_SECRET
```

Se bloquea con `409` si hubo una restauración de backup en los últimos 7 días (`cron_runs.backup_restored_at`). No lo llama el panel ni el público. Es idempotente y acotado en tiempo: si tarda más del presupuesto de la ejecución, se detiene y deja lo pendiente para la próxima corrida. `last_success_at` solo avanza cuando no hubo fallos de Blob ni borrados pendientes; en caso contrario responde `500` y conserva el éxito anterior, mientras `last_run_at` sí se actualiza.

## 6. Cabeceras

En `/api/*`:

```
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

En el resto del sitio, desde `next.config.ts` y `src/proxy.ts`:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains (solo producción)
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
```

En `/admin/*` la CSP usa un nonce por solicitud con `'strict-dynamic'`; esas rutas se renderizan dinámicamente. Ver `11-seguridad-hardening.md`.

## 7. Errores HTTP y rutas inexistentes

| Situación                                       | Respuesta                                 |
| ----------------------------------------------- | ----------------------------------------- |
| Ruta que no coincide con ninguna ruta de la app | `404` de Next.js                          |
| Colección inexistente (`/no-existe`)            | `404` desde el proxy                      |
| Slug inexistente o no publicado                 | `404` desde el proxy                      |
| Slug anterior con redirección registrada        | `301/302/307/308` desde el proxy          |
| `/admin/*` sin cookie de sesión                 | `307` hacia `/admin/login`                |
| `/admin/*` con cookie inválida                  | Redirección entregada en el payload (200) |

Motivo: con Cache Components la respuesta empieza a transmitirse antes de que la página resuelva, así que `notFound()` ya no puede cambiar el estado. La decisión se toma en `src/proxy.ts` (ver D-023 en `01-stack-arquitectura.md`).

El proxy resuelve los slugs anteriores contra `redirects` **antes** de responder 404. Conserva el código almacenado (`301`, `302`, `307` o `308`), rechaza destinos que no sean rutas internas absolutas (`isSafeRedirectTarget`) y cachea el resultado 15 s por instancia. Si el presupuesto de confirmaciones por minuto se agota, falla abierto: deja renderizar y la página bloqueante decide su propio 404, de modo que un presupuesto agotado nunca produce un 404 falso.

El 404 del proxy es un documento HTML propio, en español, con el mismo mensaje y la misma paleta que `src/app/not-found.tsx`, e incluye `Cache-Control: no-store`, la CSP pública y `X-Robots-Tag` implícito mediante `<meta name="robots" content="noindex">`.

Verificación: `npm run test:http` comprueba que una ruta inexistente y un slug inexistente devuelven `404` y que `/admin` sin sesión devuelve una redirección. La unidad `src/lib/public-content-guard.test.ts` cubre la validación de destinos y estados de redirección; la comprobación de redirecciones reales contra la base queda pendiente del entorno con datos.
