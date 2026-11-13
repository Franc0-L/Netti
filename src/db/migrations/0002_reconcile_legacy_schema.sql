-- Reconciliation migration for databases created before the baseline was
-- tracked by drizzle (the production Neon instance has the ten tables but
-- none of the checks, foreign keys, triggers, functions or secondary indexes
-- declared in 0000_initial_schema.sql).
--
-- Every statement is idempotent: it creates only what is missing, so the
-- file is a no-op on databases already migrated from 0000/0001 and it brings a
-- legacy database to the canonical schema in a single pass.
--
-- One legacy cleanup is needed before the canonical unique index can be
-- created: databases without the `articles_set_updated_at` trigger stored
-- several snapshots for the same (article_id, version). The newest snapshot of
-- each version is kept, because that is the state the article ended in.
-- --> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); NEW.version := OLD.version + 1; RETURN NEW; END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_article_tags() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF cardinality(NEW.tags) > 5 THEN RAISE EXCEPTION 'Máximo 5 etiquetas.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.tags) AS tag WHERE char_length(btrim(tag)) = 0 OR char_length(tag) > 30)
  THEN RAISE EXCEPTION 'Cada etiqueta debe tener entre 1 y 30 caracteres.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT lower(btrim(tag)) AS normalized, count(*) AS amount FROM unnest(NEW.tags) AS tag GROUP BY lower(btrim(tag))) duplicates WHERE amount > 1)
  THEN RAISE EXCEPTION 'No se pueden repetir etiquetas.' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_redirect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cycle_found boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('redirects_graph'));
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.from_path = NEW.to_path THEN RAISE EXCEPTION 'La redirección apunta a sí misma.' USING ERRCODE = '23514'; END IF;
  IF NEW.from_path !~ '^/[^/][^ ]*$' OR NEW.to_path !~ '^/[^/][^ ]*$'
  OR NEW.from_path LIKE '%//%' OR NEW.to_path LIKE '%//%'
  OR position(chr(92) in NEW.from_path) > 0 OR position(chr(92) in NEW.to_path) > 0
  OR NEW.from_path LIKE '%?%' OR NEW.to_path LIKE '%?%' OR NEW.from_path LIKE '%#%' OR NEW.to_path LIKE '%#%'
  OR NEW.from_path ~ '[[:cntrl:]]' OR NEW.to_path ~ '[[:cntrl:]]'
  THEN RAISE EXCEPTION 'Las rutas de redirección deben ser internas absolutas.' USING ERRCODE = '23514'; END IF;
  SELECT EXISTS (WITH RECURSIVE chain(path) AS (
   SELECT to_path FROM redirects WHERE from_path = NEW.to_path
   UNION SELECT r.to_path FROM chain c JOIN redirects r ON r.from_path = c.path
  ) SELECT 1 FROM chain WHERE path = NEW.from_path) INTO cycle_found;
  IF cycle_found THEN RAISE EXCEPTION 'La redirección crearía un ciclo.' USING ERRCODE = '23514'; END IF;
  UPDATE redirects SET to_path = NEW.to_path WHERE to_path = NEW.from_path AND from_path <> NEW.to_path;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "score_rarities" (
"key" text PRIMARY KEY NOT NULL, "label" text NOT NULL CONSTRAINT "score_rarities_label_unique" UNIQUE,
"color_token" text NOT NULL, "min_score" integer NOT NULL, "max_score" integer NOT NULL,
"position" integer NOT NULL CONSTRAINT "score_rarities_position_unique" UNIQUE,
CONSTRAINT "score_rarities_min_score_valid" CHECK ("min_score" between 0 and 100),
CONSTRAINT "score_rarities_max_score_valid" CHECK ("max_score" between 0 and 100),
CONSTRAINT "score_rarities_range_valid" CHECK ("min_score" <= "max_score")
);
--> statement-breakpoint
INSERT INTO "score_rarities" ("key", "label", "color_token", "min_score", "max_score", "position") VALUES
('mythic', 'Mítica', 'gold', 90, 100, 1),
('legendary', 'Legendaria', 'red', 80, 89, 2),
('epic', 'Épica', 'accent', 60, 79, 3),
('rare', 'Rara', 'cyan', 40, 59, 4),
('uncommon', 'Poco común', 'green', 20, 39, 5),
('common', 'Común', 'neutral', 0, 19, 6)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION article_score_details_valid(details jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  detail_key text;
  detail_value jsonb;
  detail_count integer := 0;
BEGIN
  IF details IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(details) <> 'object' THEN RETURN false; END IF;
  FOR detail_key IN SELECT jsonb_object_keys(details) LOOP
    IF detail_key NOT IN ('story', 'gameplay', 'visual') THEN RETURN false; END IF;
    detail_value := details -> detail_key;
    IF jsonb_typeof(detail_value) <> 'number' THEN RETURN false; END IF;
    IF (detail_value #>> '{}')::numeric <> trunc((detail_value #>> '{}')::numeric) THEN RETURN false; END IF;
    IF (detail_value #>> '{}')::numeric < 1 OR (detail_value #>> '{}')::numeric > 10 THEN RETURN false; END IF;
    detail_count := detail_count + 1;
  END LOOP;
  RETURN detail_count > 0;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "score_details" jsonb;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "rarity_key" text;
--> statement-breakpoint
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('media', 'media_dimensions_positive', $def$CHECK ("width" > 0 AND "height" > 0)$def$),
      ('media', 'media_bytes_positive', $def$CHECK ("bytes" > 0)$def$),
      ('media', 'media_webp_only', $def$CHECK ("content_type" = 'image/webp')$def$),
      ('media', 'media_rights_valid', $def$CHECK ("rights" IN ('own', 'press', 'third_party'))$def$),
      ('media', 'media_rights_require_credit', $def$CHECK ("rights" = 'own' OR char_length(btrim(coalesce("credit", ''))) > 0)$def$),
      ('media', 'media_source_url_valid', $def$CHECK ("source_url" IS NULL OR "source_url" ~* '^https?://')$def$),
      ('games', 'games_slug_format', $def$CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')$def$),
      ('games', 'games_title_length', $def$CHECK (char_length("title") BETWEEN 3 AND 120)$def$),
      ('games', 'games_description_length', $def$CHECK (char_length("description") <= 240)$def$),
      ('games', 'games_external_source_valid', $def$CHECK ("external_source" IS NULL OR "external_source" IN ('rawg', 'igdb', 'manual'))$def$),
      ('games', 'games_external_source_and_id_together', $def$CHECK (("external_source" IS NULL AND "external_id" IS NULL) OR ("external_source" IS NOT NULL AND "external_id" IS NOT NULL))$def$),
      ('games', 'games_status_valid', $def$CHECK ("status" IN ('draft', 'published'))$def$),
      ('games', 'games_published_requires_cover', $def$CHECK ("status" <> 'published' OR "cover_image_url" IS NOT NULL)$def$),
      ('games', 'games_cover_media_fk', $def$FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE RESTRICT$def$),
      ('articles', 'articles_kind_valid', $def$CHECK ("kind" IN ('review', 'news', 'guide'))$def$),
      ('articles', 'articles_status_valid', $def$CHECK ("status" IN ('draft', 'published', 'trashed'))$def$),
      ('articles', 'articles_previous_status_valid', $def$CHECK ("previous_status" IS NULL OR "previous_status" IN ('draft', 'published'))$def$),
      ('articles', 'articles_title_len', $def$CHECK (char_length("title") <= 120)$def$),
      ('articles', 'articles_description_len', $def$CHECK (char_length("description") <= 240)$def$),
      ('articles', 'articles_seo_description_len', $def$CHECK ("seo_description" IS NULL OR char_length("seo_description") <= 160)$def$),
      ('articles', 'articles_slug_format', $def$CHECK ("slug" = '' OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')$def$),
      ('articles', 'articles_source_url', $def$CHECK ("source_url" IS NULL OR "source_url" ~* '^https?://')$def$),
      ('articles', 'articles_published_requires_date', $def$CHECK ("status" <> 'published' OR "published_at" IS NOT NULL)$def$),
      ('articles', 'articles_trashed_requires_date', $def$CHECK ("status" <> 'trashed' OR "trashed_at" IS NOT NULL)$def$),
      ('articles', 'articles_trashed_requires_previous', $def$CHECK ("status" <> 'trashed' OR "previous_status" IS NOT NULL)$def$),
      ('articles', 'articles_publish_title', $def$CHECK ("status" <> 'published' OR char_length(btrim("title")) BETWEEN 3 AND 120)$def$),
      ('articles', 'articles_publish_slug', $def$CHECK ("status" <> 'published' OR "slug" <> '')$def$),
      ('articles', 'articles_publish_body', $def$CHECK ("status" <> 'published' OR char_length(btrim("body")) >= 10)$def$),
      ('articles', 'articles_news_fields_only', $def$CHECK ("kind" = 'news' OR ("category" IS NULL AND "source_name" IS NULL AND "source_url" IS NULL))$def$),
      ('articles', 'articles_news_category_len', $def$CHECK ("category" IS NULL OR char_length("category") <= 40)$def$),
      ('articles', 'articles_game_fk', $def$FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT$def$),
      ('articles', 'articles_cover_media_fk', $def$FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE RESTRICT$def$),
      ('articles', 'articles_og_media_fk', $def$FOREIGN KEY ("og_media_id") REFERENCES "media"("id") ON DELETE RESTRICT$def$),
      ('articles', 'articles_rarity_fk', $def$FOREIGN KEY ("rarity_key") REFERENCES "score_rarities"("key") ON DELETE RESTRICT$def$),
      ('media_variants', 'media_variants_dimensions_positive', $def$CHECK ("width" > 0)$def$),
      ('media_variants', 'media_variants_bytes_positive', $def$CHECK ("bytes" > 0)$def$),
      ('media_variants', 'media_variants_media_id_media_id_fk', $def$FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE$def$),
      ('article_revisions', 'article_revisions_version_positive', $def$CHECK ("version" > 0)$def$),
      ('article_revisions', 'article_revisions_article_id_articles_id_fk', $def$FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE$def$),
      ('sessions', 'sessions_expiry_order', $def$CHECK ("expires_at" <= "absolute_expires_at")$def$),
      ('redirects', 'redirects_status_code_valid', $def$CHECK ("status_code" IN (301, 302, 307, 308))$def$),
      ('storage_orphans', 'storage_orphans_action_valid', $def$CHECK ("action" IN ('put', 'delete'))$def$),
      ('storage_orphans', 'storage_orphans_status_valid', $def$CHECK ("status" IN ('pending', 'repaired', 'failed'))$def$)
    ) AS constraints(table_name, constraint_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = item.constraint_name AND conrelid = item.table_name::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I %s',
        item.table_name,
        item.constraint_name,
        item.definition
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_review_fields_only";
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_review_complete";
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_score_valid";
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_score_details_valid";
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_review_fields_only" CHECK ("kind" = 'review' OR ("game_id" IS NULL AND "score" IS NULL AND "score_details" IS NULL AND "rarity_key" IS NULL AND "score_reason" IS NULL AND "verdict" IS NULL));
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_review_complete" CHECK ("kind" <> 'review' OR "status" <> 'published' OR ("game_id" IS NOT NULL AND "score" IS NOT NULL AND "score" between 0 AND 100 AND char_length(btrim(coalesce("score_reason", ''))) >= 20 AND char_length(btrim(coalesce("verdict", ''))) >= 10));
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_score_valid" CHECK ("score" IS NULL OR "score" between 0 and 100);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_score_details_valid" CHECK ("score_details" IS NULL OR article_score_details_valid("score_details"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "games_external_idx" ON "games" USING btree ("external_source","external_id") WHERE "external_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_cover_media_idx" ON "games" USING btree ("cover_media_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_platforms_idx" ON "games" USING gin ("platforms");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_genres_idx" ON "games" USING gin ("genres");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "articles_kind_slug_active" ON "articles" USING btree ("kind","slug") WHERE "status" <> 'trashed' AND "slug" <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_visible_idx" ON "articles" USING btree ("kind","published_at") WHERE "status" = 'published';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_featured_idx" ON "articles" USING btree ("published_at") WHERE "featured" AND "status" = 'published';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_tags_idx" ON "articles" USING gin ("tags");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_game_idx" ON "articles" USING btree ("game_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_rarity_idx" ON "articles" USING btree ("rarity_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_cover_media_idx" ON "articles" USING btree ("cover_media_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_og_media_idx" ON "articles" USING btree ("og_media_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_variants_media_width_unique" ON "media_variants" USING btree ("media_id","width");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_variants_media_id_idx" ON "media_variants" USING btree ("media_id");
--> statement-breakpoint
DELETE FROM "article_revisions" "older"
 USING "article_revisions" "newer"
 WHERE "older"."article_id" = "newer"."article_id"
   AND "older"."version" = "newer"."version"
   AND ("older"."created_at", "older"."id") < ("newer"."created_at", "newer"."id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "article_revisions_article_version_unique" ON "article_revisions" USING btree ("article_id","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_revisions_created_idx" ON "article_revisions" USING btree ("article_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip_hash","attempted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_attempted_idx" ON "login_attempts" USING btree ("attempted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redirects_to_path_idx" ON "redirects" USING btree ("to_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_orphans_pending_idx" ON "storage_orphans" USING btree ("created_at") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION articles_set_rarity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rarity_key text;
BEGIN
  IF NEW.score IS NULL THEN
    NEW.rarity_key := NULL;
    RETURN NEW;
  END IF;
  SELECT sr."key" INTO rarity_key FROM "score_rarities" sr
    WHERE NEW.score BETWEEN sr."min_score" AND sr."max_score"
    ORDER BY sr."min_score" DESC LIMIT 1;
  IF rarity_key IS NULL THEN
    RAISE EXCEPTION 'No hay rareza definida para la puntuación %', NEW.score USING ERRCODE = '23514';
  END IF;
  NEW.rarity_key := rarity_key;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "games_set_updated_at" ON "games";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "articles_validate_tags" ON "articles";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "articles_set_updated_at" ON "articles";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "redirects_validate" ON "redirects";
--> statement-breakpoint
DROP TRIGGER IF EXISTS "articles_set_rarity" ON "articles";
--> statement-breakpoint
CREATE TRIGGER "games_set_updated_at" BEFORE UPDATE ON "games" FOR EACH ROW
WHEN (to_jsonb(OLD) - 'updated_at' - 'version' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' - 'version')
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "articles_validate_tags" BEFORE INSERT OR UPDATE ON "articles" FOR EACH ROW EXECUTE FUNCTION validate_article_tags();
--> statement-breakpoint
CREATE TRIGGER "articles_set_updated_at" BEFORE UPDATE ON "articles" FOR EACH ROW
WHEN (to_jsonb(OLD) - 'updated_at' - 'version' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' - 'version')
EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "redirects_validate" BEFORE INSERT OR UPDATE ON "redirects" FOR EACH ROW EXECUTE FUNCTION validate_redirect();
--> statement-breakpoint
CREATE TRIGGER "articles_set_rarity" BEFORE INSERT OR UPDATE ON "articles" FOR EACH ROW EXECUTE FUNCTION articles_set_rarity();
