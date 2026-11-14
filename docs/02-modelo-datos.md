# Modelo de Contenido y Datos — Netti

Define el esquema PostgreSQL (Neon), las restricciones que viven en la base, las tablas auxiliares y la validación Zod.

## 1. Tablas

| Tabla               | Función                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `games`             | Catálogo de juegos (entidad propia, referenciada por las reseñas) |
| `articles`          | Reseñas, noticias y guías. Una tabla con `kind`, no tres          |
| `article_gallery`   | Galería ordenada de imágenes de un artículo                       |
| `score_rarities`    | Bandas de rareza derivadas de la puntuación (umbrales y color)    |
| `media`             | Imágenes subidas, con dimensiones y variantes                     |
| `media_variants`    | Variantes pregeneradas (480/960/1600 px) de cada medio            |
| `article_revisions` | Snapshots por guardado, para deshacer                             |
| `sessions`          | Sesiones del panel                                                |
| `login_attempts`    | Rate limiting del login                                           |
| `redirects`         | Redirecciones por cambio de slug                                  |
| `storage_orphans`   | Registro de compensación entre Blob y Postgres                    |
| `cron_runs`         | Cursor del job de revalidación programada y otros jobs            |

### Por qué una sola tabla `articles`

Cuatro tablas separadas obligan a repetir en cada una: el predicado de visibilidad, el índice de búsqueda, la papelera, el sitemap y la validación de slug. Basta olvidar `published_at <= now()` en una consulta para filtrar borradores.

Con `articles(kind)` hay **un** lugar donde se define qué es visible, **un** predicado de visibilidad y **un** namespace de slugs por `kind` (`/resenas/x` y `/guias/x` pueden coexistir). La integridad referencial se conserva con `game_id` nullable y un `CHECK` que lo exige solo cuando `kind = 'review'`.

`games` queda aparte porque es una entidad de catálogo, no un artículo, y la comparten varias reseñas.

No hay tabla `users`: un solo autor, contraseña como hash en el entorno.

## 2. Esquema SQL

### 2.0 Tipos y funciones

```sql
create type article_kind as enum ('review', 'news', 'guide');
create type content_status as enum ('draft', 'published', 'trashed');

-- No existe 'scheduled': programar es publicar con published_at futuro.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function validate_tags()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from unnest(new.tags) as t
    where char_length(btrim(t)) = 0 or char_length(t) > 30
  ) then
    raise exception 'Cada etiqueta debe tener entre 1 y 30 caracteres.'
      using errcode = '23514';
  end if;
  if cardinality(new.tags) > 5 then
    raise exception 'Máximo 5 etiquetas.' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.tags) as t
    where t !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ) then
    raise exception 'Cada etiqueta debe usar solo minúsculas, números y guiones (ej: mi-tag).' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function validate_redirect()
returns trigger
language plpgsql
as $$
declare
  cycle_found boolean;
begin
  -- Serializa las modificaciones del grafo de redirecciones para evitar ciclos
  -- creados por transacciones concurrentes (ej. A→B y B→A al mismo tiempo).
  perform pg_advisory_xact_lock(hashtext('redirects_graph'));

  -- Evita recursión: el UPDATE de abajo vuelve a disparar este trigger
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.from_path = new.to_path then
    raise exception 'La redirección apunta a sí misma.' using errcode = '23514';
  end if;

  -- Rutas internas absolutas: empiezan por '/' seguido de un carácter no '/'.
  -- Rechaza '//' (open redirect), barras invertidas, caracteres de control,
  -- query strings y fragmentos. El contrato es solo de paths internos.
  if new.from_path !~ '^/[^/][^ ]*$'
     or new.to_path !~ '^/[^/][^ ]*$'
     or new.from_path like '%//%'
     or new.to_path like '%//%'
     or position(chr(92) in new.from_path) > 0
     or position(chr(92) in new.to_path) > 0
     or new.from_path like '%?%'
     or new.to_path like '%?%'
     or new.from_path like '%#%'
     or new.to_path like '%#%'
     or new.from_path ~ '[[:cntrl:]]'
     or new.to_path ~ '[[:cntrl:]]' then
    raise exception 'Las rutas de redirección deben ser internas absolutas.' using errcode = '23514';
  end if;

  -- Detección de ciclos mediante CTE recursiva: seguir la cadena desde new.to_path
  -- hasta encontrar new.from_path. Si se llega, hay un ciclo de cualquier longitud.
  -- Usa UNION (no UNION ALL) para garantizar terminación incluso con ciclos preexistentes.
  select exists (
    with recursive chain(to_path) as (
      select to_path from redirects where from_path = new.to_path
      union
      select r.to_path from chain c join redirects r on r.from_path = c.to_path
    )
    select 1 from chain where to_path = new.from_path
  ) into cycle_found;

  if cycle_found then
    raise exception 'La redirección crearía un ciclo.' using errcode = '23514';
  end if;

  -- Colapsa cadenas: si X→A existía y ahora A→B, X pasa a apuntar a B.
  -- El filtro evita crear un auto-redirect al colapsar sobre la fila que se está insertando.
  -- El ciclo directo A→B / B→A ya fue rechazado por el chequeo de ciclos arriba,
  -- así que no hace falta un DELETE separado de la fila inversa.
  update redirects
     set to_path = new.to_path
   where to_path = new.from_path
     and from_path <> new.to_path;
  return new;
end;
$$;
```

El trigger de redirecciones se ejecuta `BEFORE INSERT OR UPDATE` y colapsa cadenas y rechaza ciclos. Sin él, renombrar A→B y luego B→A deja un bucle infinito que el navegador corta y el SEO castiga.

### 2.1 `games`

```sql
create table games (
  id               integer generated always as identity primary key,
  slug             text not null unique
                     check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title            text not null check (char_length(title) between 3 and 120),
  description      text not null default '' check (char_length(description) <= 240),
  body             text not null default '',
  developer        text,
  publisher        text,
  release_date     timestamptz,
  platforms        text[] not null default '{}',
  genres           text[] not null default '{}',
  tags             text[] not null default '{}',
  featured         boolean not null default false,
  external_source  text check (external_source in ('rawg', 'igdb', 'manual')),
  external_id      text,
  constraint games_external_source_and_id_together
    check (external_source is null and external_id is null
           or external_source is not null and external_id is not null),
  status           content_status not null default 'draft',
  previous_status  content_status,
  trashed_at       timestamptz,
  cover_image_url  text,        -- URL pública derivada de cover_media_id; caché derivado
  cover_alt        text,
  cover_media_id   integer,     -- FK agregada con ALTER TABLE tras crear media
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  version          integer not null default 1,
  constraint games_published_requires_cover
    check (status <> 'published' or cover_image_url is not null),
  constraint games_trashed_requires_date
    check (status <> 'trashed' or trashed_at is not null),
  constraint games_trashed_requires_previous
    check (status <> 'trashed' or previous_status is not null)
);

create unique index games_external_idx
  on games (external_source, external_id)
  where external_id is not null;

create index games_tags_idx on games using gin (platforms, genres, tags);

create trigger games_set_updated_at
  before update on games
  for each row
  when (
    to_jsonb(old) - 'updated_at' - 'version'
    is distinct from
    to_jsonb(new) - 'updated_at' - 'version'
  )
  execute function set_updated_at();
```

`release_date` es una fecha completa, no solo el año: las noticias suelen anunciar lanzamientos futuros y el año solo no alcanza. El esquema runtime la define como `timestamptz`; la UI muestra solo la fecha.

`games` tiene papelera reversible: `previous_status` y `trashed_at` permiten restaurar la ficha al estado que tenía. Despublicar o enviar a papelera se rechaza en la aplicación si la ficha tiene reseñas publicadas, porque quedarían apuntando a un juego oculto. La columna `tags` (con índice GIN propio) y `featured` llegaron con la migración `0003`; la papelera, con `0004`.

### 2.2 `articles`

```sql
create table articles (
  id               integer generated always as identity primary key,
  kind             article_kind not null,
  slug             text not null default '',
  title            text not null default '',
  description      text not null default '',
  body             text not null default '',
  published_at     timestamptz,
  author           text,
  tags             text[] not null default '{}',
  cover_image_url  text,        -- URL pública derivada de cover_media_id; caché derivado
  cover_alt        text,
  cover_media_id   integer,     -- FK agregada con ALTER TABLE tras crear media
  status           content_status not null default 'draft',
  previous_status  content_status,
  trashed_at       timestamptz,
  featured         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  version          integer not null default 1,

  -- Reseñas
  game_id          integer references games (id) on delete restrict,
  score            smallint check (score between 0 and 100),
  score_details    jsonb,         -- { story, gameplay, visual }, cada uno de 1 a 10
  rarity_key       text references score_rarities (key) on delete restrict,
  score_reason     text,
  verdict          text,

  -- Noticias
  category         text,
  source_name      text,
  source_url       text,

  -- Formato editorial
  pros             text[] not null default '{}',
  cons             text[] not null default '{}',
  video_url        text,
  video_title      text,

  -- SEO
  seo_title        text,
  seo_description  text,
  og_image_url     text,        -- URL pública derivada de og_media_id; caché derivado
  og_media_id      integer,     -- FK agregada con ALTER TABLE tras crear media

  -- Formato
  constraint articles_title_len
    check (char_length(title) <= 120),
  constraint articles_description_len
    check (char_length(description) <= 240),
  constraint articles_seo_description_len
    check (seo_description is null or char_length(seo_description) <= 160),
  constraint articles_slug_format
    check (slug = '' or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint articles_source_url
    check (source_url is null or source_url ~* '^https?://'),

  -- Estados
  constraint articles_published_requires_date
    check (status <> 'published' or published_at is not null),
  constraint articles_trashed_requires_date
    check (status <> 'trashed' or trashed_at is not null),
  constraint articles_trashed_requires_previous
    check (status <> 'trashed' or previous_status is not null),

  -- Publicación completa
  constraint articles_publish_title
    check (status <> 'published' or char_length(btrim(title)) between 3 and 120),
  constraint articles_publish_slug
    check (status <> 'published' or slug <> ''),
  constraint articles_publish_body
    check (status <> 'published' or char_length(btrim(body)) >= 10),

  -- Campos por tipo
  constraint articles_review_fields_only
    check (kind = 'review' or (game_id is null and score is null
           and score_details is null and rarity_key is null
           and score_reason is null and verdict is null)),
  constraint articles_score_valid
    check (score is null or score between 0 and 100),
  constraint articles_score_details_valid
    check (score_details is null or article_score_details_valid(score_details)),
  constraint articles_review_complete
    check (kind <> 'review' or status <> 'published' or (
      game_id is not null
      and score is not null
      and score between 0 and 100
      and char_length(btrim(coalesce(score_reason, ''))) >= 20
      and char_length(btrim(coalesce(verdict, ''))) >= 10
    )),
  constraint articles_news_fields_only
    check (kind = 'news' or (category is null and source_name is null and source_url is null)),
  constraint articles_news_category_len
    check (category is null or char_length(category) <= 40),

  -- Listas y video (migración 0003)
  constraint articles_pros_limit
    check (cardinality(pros) <= 5),
  constraint articles_cons_limit
    check (cardinality(cons) <= 5),
  constraint articles_pros_items_valid
    check (article_bullet_list_valid(pros)),
  constraint articles_cons_items_valid
    check (article_bullet_list_valid(cons)),
  constraint articles_video_url_valid
    check (video_url is null or video_url ~* '^https?://'),
  constraint articles_video_title_len
    check (video_title is null or char_length(video_title) <= 200),
  constraint articles_video_together
    check ((video_url is null and video_title is null)
        or (video_url is not null and video_title is not null))
);

create unique index articles_kind_slug_active
  on articles (kind, slug)
  where status <> 'trashed' and slug <> '';

create index articles_visible_idx
  on articles (kind, published_at desc)
  where status = 'published';

create index articles_featured_idx
  on articles (published_at desc)
  where featured and status = 'published';

create index articles_tags_idx on articles using gin (tags);

-- Índice para consultar publicaciones por fecha. Incluye todas las publicadas
-- (pasadas y futuras); el job de revalidación filtra las que ya cruzaron la hora.
create index articles_pending_activation_idx
  on articles (published_at, id)
  where status = 'published';

create trigger articles_validate_tags
  before insert or update on articles
  for each row execute function validate_tags();

create trigger articles_set_updated_at
  before update on articles
  for each row
  when (
    to_jsonb(old) - 'updated_at' - 'version'
    is distinct from
    to_jsonb(new) - 'updated_at' - 'version'
  )
  execute function set_updated_at();
```

`previous_status` y `trashed_at` existen porque "restaurar devuelve el estado anterior" necesita dónde guardarlo. Sin esas columnas, restaurar solo puede adivinar.

`WHEN` sobre `to_jsonb(old)` menos `updated_at` y `version` evita dos cosas: que un `UPDATE` que no cambia nada incremente `version`, y que el propio trigger, al escribir `updated_at`, se considere un cambio.

**Qué permite un borrador**: `title` vacío, `slug` vacío, `body` vacío, sin portada, sin puntuación, sin fecha. Lo único obligatorio es `kind` y `status`. Todo lo demás se exige recién al publicar, mediante los `CHECK` con `status <> 'published' or ...`.

### 2.2.1 `article_gallery`

```sql
create table article_gallery (
  id          integer generated always as identity primary key,
  article_id  integer not null references articles (id) on delete cascade,
  media_id    integer not null references media (id) on delete restrict,
  position    integer not null check (position between 0 and 19),
  created_at  timestamptz not null default now(),
  constraint article_gallery_article_position_unique unique (article_id, position),
  constraint article_gallery_article_media_unique unique (article_id, media_id)
);

create index article_gallery_media_id_idx on article_gallery (media_id);
```

La galería es una tabla propia y no una lista de referencias `media:<id>` dentro del Markdown: el panel puede reordenarla, y la posición es un dato del esquema. `media_id` usa `ON DELETE RESTRICT` para que un medio en uso no se pueda borrar por error. `article_id` usa `CASCADE` porque la galería no sobrevive al artículo.

### 2.2.2 `score_rarities`

La rareza es un dato, no una decisión de la interfaz: los umbrales, la etiqueta y el color viven en la base y `articles.rarity_key` se calcula con un trigger.

```sql
create table score_rarities (
  key          text primary key,
  label        text not null unique,
  color_token  text not null,
  min_score    integer not null check (min_score between 0 and 100),
  max_score    integer not null check (max_score between 0 and 100),
  position     integer not null unique,
  constraint score_rarities_range_valid check (min_score <= max_score)
);

insert into score_rarities (key, label, color_token, min_score, max_score, position) values
  ('mythic',    'Mítica',     'gold',     90, 100, 1),
  ('legendary', 'Legendaria', 'red',      80,  89, 2),
  ('epic',      'Épica',      'accent',   60,  79, 3),
  ('rare',      'Rara',       'cyan',     40,  59, 4),
  ('uncommon',  'Poco común', 'green',    20,  39, 5),
  ('common',    'Común',      'neutral',   0,  19, 6);

create or replace function articles_set_rarity()
returns trigger
language plpgsql
as $$
declare
  rarity_key text;
begin
  if new.score is null then
    new.rarity_key := null;
    return new;
  end if;
  select sr.key into rarity_key
    from score_rarities sr
   where new.score between sr.min_score and sr.max_score
   order by sr.min_score desc
   limit 1;
  if rarity_key is null then
    raise exception 'No hay rareza definida para la puntuación %', new.score
      using errcode = '23514';
  end if;
  new.rarity_key := rarity_key;
  return new;
end;
$$;

create trigger articles_set_rarity
  before insert or update on articles
  for each row execute function articles_set_rarity();
```

El trigger corre antes de los `CHECK`, así que la columna derivada nunca contradice las restricciones. Si el score no cae en ninguna banda, la escritura se rechaza: una reseña con puntuación siempre tiene rareza.

`color_token` apunta a un token de CSS (`--gold`, `--red`, `--accent`, `--cyan`, `--green`, `--neutral`). La interfaz lee la fila y no decide ni el nombre ni el color.

### 2.2.3 Subpuntuaciones

`score_details` guarda el desglose editorial (`story`, `gameplay`, `visual`, cada uno de 1 a 10). Se valida en la base con una función `IMMUTABLE`, porque un `CHECK` no admite subconsultas:

```sql
create or replace function article_score_details_valid(details jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  detail_key   text;
  detail_value jsonb;
  detail_count integer := 0;
begin
  if details is null then return true; end if;
  if jsonb_typeof(details) <> 'object' then return false; end if;
  for detail_key in select jsonb_object_keys(details) loop
    if detail_key not in ('story', 'gameplay', 'visual') then return false; end if;
    detail_value := details -> detail_key;
    if jsonb_typeof(detail_value) <> 'number' then return false; end if;
    if (detail_value #>> '{}')::numeric <> trunc((detail_value #>> '{}')::numeric) then return false; end if;
    if (detail_value #>> '{}')::numeric < 1 or (detail_value #>> '{}')::numeric > 10 then return false; end if;
    detail_count := detail_count + 1;
  end loop;
  return detail_count > 0;
exception when others then
  return false;
end;
$$;
```

El contrato es el mismo en las dos capas: objeto estricto, sin claves desconocidas, con al menos una dimensión informada y todas dentro de 1 a 10.

### 2.3 Búsqueda

**No hay columna `search_vector` ni índices de trigramas en el esquema vigente.** La búsqueda se resuelve en dos capas:

- **Pública** (`/buscar`): un índice estático cacheado en memoria con títulos, descripciones y etiquetas de los artículos visibles, buscado en el cliente y normalizando tildes. La arquitectura exige que `/buscar` no consulte Postgres en tiempo real, así que no hay consulta ni FTS en esa ruta.
- **Panel**: `ILIKE` sobre el título, con los comodines `%`, `_` y `\` escapados (`escapeLike`), sobre un `select` paginado.

El diseño original de full-text (`unaccent`, `es_unaccent`, `search_vector` generado y `pg_trgm` para el autocompletado de juegos) queda documentado aquí como opción, no como estado. Si alguna vez se implementa, el autocompletado de juegos necesita trigramas: `tsvector` no sirve para prefijos de dos letras.

```sql
-- No aplicado. Referencia del diseño original:
create index games_title_trgm_idx on games using gin (title gin_trgm_ops);
```

### 2.4 `media`

```sql
create table media (
  id            integer generated always as identity primary key,
  storage_key   text not null unique,
  public_url    text not null,
  width         integer not null check (width > 0),
  height        integer not null check (height > 0),
  bytes         integer not null check (bytes > 0),
  content_type  text not null default 'image/webp'
                  check (content_type = 'image/webp'),
  alt           text,
  credit        text,
  rights        text not null default 'own'
                  check (rights in ('own', 'press', 'third_party')),
  source_url    text,
  pending_delete_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint media_rights_require_credit
    check (rights = 'own' or char_length(btrim(coalesce(credit, ''))) > 0),
  constraint media_source_url_valid
    check (source_url is null or source_url ~* '^https?://')
);

create table media_variants (
  id          integer generated always as identity primary key,
  media_id    integer not null references media (id) on delete cascade,
  width       integer not null check (width > 0),
  storage_key text not null unique,
  public_url  text not null,
  bytes       integer not null check (bytes > 0),
  unique (media_id, width)
);

create index media_variants_media_id_idx on media_variants (media_id);
```

**Precedencia del texto alternativo (`alt`)**:

1. `articles.cover_alt` (o `games.cover_alt`): sobrescritura opcional solo cuando el medio se usa como portada de ese artículo/juego.
2. El texto del Markdown en `![alt](media:12)`: usado para imágenes dentro del cuerpo del artículo.
3. `media.alt`: alt base del medio en la biblioteca, usado cuando no hay sobrescritura de portada ni texto en el Markdown.

Sin `media`, la purga de la papelera no sabe qué imágenes borrar y las subidas huérfanas se acumulan. `credit`, `rights` y `source_url` documentan procedencia: una carátula disponible públicamente no es una carátula libre de derechos.

`article_id` y `game_id` **no existen** en `media` (recorte del MVP). Antes de purgar un medio, se comprueba exhaustivamente que ningún otro artículo o juego lo referencie en cualquiera de estos lugares:

- `articles.cover_media_id` y `articles.og_media_id` y `games.cover_media_id`
- Apariciones de `media:<id>` en `articles.body` (regex con borde: `media:1` no matchea `media:12`)
- Apariciones de `media:<id>` en `games.body` (si se permite esa sintaxis en fichas)

Solo si ninguna referencia existe, el medio se considera huérfano y se marca para purga.

**Borrado consistente.** Postgres y Blob no comparten transacción, así que el orden importa:

1. En una transacción: recolectar los ids de medios que solo referencia este artículo o juego (comprobando `cover_media_id`, referencias `media:<id>` en `articles.body` y `games.body`), borrar la fila del artículo o juego (la FK `ON DELETE RESTRICT` protege `media` si aún se usa como `cover_media_id`), y recién entonces marcar `pending_delete_at` en los medios huérfanos (las revisiones caen por `ON DELETE CASCADE`).
2. Fuera de la transacción: borrar en Blob el objeto y sus variantes.
3. Solo si Blob confirma: borrar las filas de `media` y `media_variants`.

Si Blob falla, la fila queda marcada y se reintenta. Nunca al revés: borrar el objeto antes de confirmar la base deja referencias rotas que no se pueden reparar. Las imágenes referenciadas por otro artículo no se marcan.

**Imágenes dentro del cuerpo.** No se pegan URLs. El editor inserta `![texto alternativo](media:12)` y un plugin de remark resuelve el id contra `media`/`media_variants`, genera `srcset` y dimensiones. Así la purga sabe qué medios referencia el cuerpo, se evita CLS y una URL mal copiada no rompe la imagen.

**Borrado de medios con FKs.** `games` y `articles` declaran FK hacia `media` (`cover_media_id`) con `ON DELETE RESTRICT`. El orden de creación es:

1. `games` y `articles` (sin FK a `media`).
2. `media` (sin FK a `games` ni `articles`).
3. `ALTER TABLE` para agregar la FK `cover_media_id` en `games` y `articles`.

### 2.5 `article_revisions`

```sql
create table article_revisions (
  id          bigint generated always as identity primary key,
  article_id  integer not null references articles (id) on delete cascade,
  version     integer not null,
  snapshot    text not null,
  created_at  timestamptz not null default now(),
  unique (article_id, version)
);

create index article_revisions_created_idx
  on article_revisions (article_id, created_at desc);
```

Se guarda un snapshot por cada escritura desde el panel. Se conservan las últimas 20 por artículo; la retención se aplica en la misma transacción que el nuevo snapshot (`delete ... where version <= $2 - 20`). No hay cron.

### 2.6 `sessions`

```sql
create table sessions (
  id            text primary key,          -- SHA-256 hex del token, nunca el token
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_used_at  timestamptz not null default now(),
  absolute_expires_at timestamptz not null,
  user_agent    text check (char_length(user_agent) <= 300),
  ip_hash       text
);

create index sessions_expires_idx on sessions (expires_at);
```

`absolute_expires_at` (30 días) impide que la renovación deslizante mantenga una sesión viva para siempre. `last_used_at` se actualiza como máximo una vez cada 5 minutos, no en cada request.

**Purga de sesiones:** `/api/cron/cleanup` borra a diario (04:17 UTC) las filas con `expires_at < now()` o `absolute_expires_at < now()`. `/api/reconcile-storage` repite la purga como red de seguridad. No hay job semanal separado.

### 2.7 `login_attempts`

```sql
create table login_attempts (
  id           bigint generated always as identity primary key,
  ip_hash      text not null,
  attempted_at timestamptz not null default now(),
  success      boolean not null default false
);

create index login_attempts_ip_idx
  on login_attempts (ip_hash, attempted_at desc);
```

Se consulta antes de verificar la contraseña. Purga diaria de filas con más de 7 días (dueño: `/api/cron/cleanup`, con repetición en `/api/reconcile-storage`).

### 2.8 `redirects`

```sql
create table redirects (
  id           integer generated always as identity primary key,
  from_path    text not null unique,
  to_path      text not null,
  status_code  integer not null default 308 check (status_code in (301, 302, 307, 308)),
  created_at   timestamptz not null default now(),
  constraint redirects_absolute_paths
    check (from_path ~ '^/[^/][^ ]*$' and to_path ~ '^/[^/][^ ]*$'),
  constraint redirects_not_self
    check (from_path <> to_path)
);

create trigger redirects_validate
  before insert or update on redirects
  for each row execute function validate_redirect();
```

Se consulta en el proxy **solo cuando el artículo no existe**, con caché en memoria por instancia de 15 s (positiva y negativa). El cambio de slug invalida el tag `redirects`; el proxy refresca su propia caché como máximo en 15 s. No genera una consulta por request: el conjunto de slugs visibles se consulta primero y los destinos se validan con `isSafeRedirectTarget`.

### 2.9 `storage_orphans`

```sql
create table storage_orphans (
  id          bigint generated always as identity primary key,
  storage_key text not null,
  action      text not null check (action in ('put', 'delete')),
  status      text not null default 'pending' check (status in ('pending', 'repaired', 'failed')),
  created_at  timestamptz not null default now(),
  repaired_at timestamptz
);

create index storage_orphans_pending_idx
  on storage_orphans (created_at)
  where status = 'pending';
```

Registro de compensación para subidas/borrados fallidos entre Blob y Postgres. Si falla el `INSERT` en `media` tras subir objetos, o falla un borrado en Blob, se anota aquí para que un job de baja frecuencia repare o reporte el desajuste.

### 2.10 `cron_runs`

```sql
create table cron_runs (
  job_name           text not null primary key,
  last_success_at    timestamptz,
  last_run_at        timestamptz not null default now(),
  last_published_at  timestamptz,
  last_id            integer,
  backup_restored_at timestamptz
);
```

`cron_runs` no se siembra en la migración: cada job inserta su fila con `on conflict` en la primera ejecución. Los nombres en uso son `revalidate_scheduled` (`/api/revalidate`), `cleanup` (`/api/cron/cleanup`), `reconcile_storage` (`/api/reconcile-storage`) y `backup_restore` (marca dejada por `scripts/restore-db.ts`).

## 3. Validación Zod

Los esquemas Zod están definidos exclusivamente en `03-validacion-zod.md` (`makeArticleSchema`, `makeGameSchema`, `makeMediaMetadataSchema`). No se duplican aquí.

Para las reseñas, el esquema vigente es:

- `score`: entero entre 0 y 100.
- `scoreDetails`: objeto estricto con `story`, `gameplay` y `visual`, cada uno entero entre 1 y 10; se acepta cualquier subconjunto no vacío y se rechaza cualquier clave desconocida.
- `scoreReason`: obligatorio para publicar, mínimo 20 caracteres.
- `verdict`: obligatorio para publicar, mínimo 10 caracteres.

La rareza no se valida en Zod: no la escribe la aplicación. La calcula el trigger a partir del score.

## 4. Mapeo desde el Netti Legacy

El legacy guarda el contenido en archivos y usa contratos distintos. La migración de contenido existente **no** es automática: se documenta el mapeo para que cada entrada se cargue con criterio editorial.

| Legacy                             | Nuevo                                                 | Criterio                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `reviews.game` (string con nombre) | `articles.game_id` (FK numérica) + `games`            | La ficha se crea **antes** que la reseña. El nombre del legacy se usa para buscar o crear `games.slug`; no se guarda texto libre |
| `games.releaseYear` (número)       | `games.release_date` (timestamp con zona horaria)     | Se mapea al primer día del año en UTC (`YYYY-01-01`). Si el legacy aporta la fecha completa, se usa tal cual                     |
| `reviews.score` (1-100)            | `articles.score` (0-100)                              | Se conserva el valor; la rareza la deriva el trigger                                                                             |
| `reviews.scoreDetails` (1-10)      | `articles.score_details` (JSONB)                      | Se conserva el objeto tal cual                                                                                                   |
| `reviews.tags` (lista fija de 13)  | `articles.tags` (texto libre, máx. 5, ≤30 caracteres) | Se filtran por el límite del nuevo contrato; las etiquetas que no entran se descartan                                            |

Las etiquetas del legacy se conservan libres: el panel no valida contra una lista fija.

## 5. Orden de migraciones

Las FK de medios (`games_cover_media_fk`, `articles_cover_media_fk`, `articles_og_media_fk`) deben crearse **después** de la tabla `media` (definida en esta misma sección 2.4). Orden de ejecución:

1. `games` y `articles` (sin FK a `media`).
2. `media`, `media_variants`, `article_revisions`, `sessions`, `login_attempts`, `redirects`, `storage_orphans`, `cron_runs`.
3. `ALTER TABLE` para agregar la FK `cover_media_id` y la FK `og_media_id` en `articles`, y la FK `cover_media_id` en `games`.
4. Índices de medios.
5. Triggers de validación y `version`.

Ejecutar los `ALTER TABLE` antes de crear `media` fallará porque la tabla referenciada no existe.

La rareza y las subpuntuaciones llegan después, en una migración incremental sobre el baseline (`0001_score_rarity.sql`): crea `score_rarities`, agrega `articles.score_details` y `articles.rarity_key`, reemplaza las dos restricciones de reseña por sus versiones 0-100 y agrega el trigger `articles_set_rarity`. La migración no borra tablas ni datos: solo reemplaza esas dos restricciones, que vuelven a crearse en el mismo archivo.

Después vinieron:

- `0002_reconcile_legacy_schema.sql`: reconciliación idempotente de la base de producción, creada fuera de Drizzle.
- `0003_editorial_gallery_and_game_tags.sql`: `article_gallery`, `articles.pros`, `articles.cons`, `articles.video_url`, `articles.video_title`, `games.tags` y `games.featured`, con la función inmutable `article_bullet_list_valid`.
- `0004_games_trash_support.sql`: `games.previous_status`, `games.trashed_at` y el reemplazo de `games_status_valid` para admitir `'trashed'`.

El detalle de cada archivo y el catálogo verificado están en `database-migrations.md`.
