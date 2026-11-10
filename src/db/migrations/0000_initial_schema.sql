CREATE TABLE "media" (
"id" serial PRIMARY KEY NOT NULL, "storage_key" text NOT NULL CONSTRAINT "media_storage_key_unique" UNIQUE,
"public_url" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "bytes" integer NOT NULL,
"content_type" text DEFAULT 'image/webp' NOT NULL, "alt" text, "credit" text, "rights" text DEFAULT 'own' NOT NULL,
"source_url" text, "pending_delete_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "media_dimensions_positive" CHECK ("width" > 0 AND "height" > 0),
CONSTRAINT "media_bytes_positive" CHECK ("bytes" > 0), CONSTRAINT "media_webp_only" CHECK ("content_type" = 'image/webp'),
CONSTRAINT "media_rights_valid" CHECK ("rights" IN ('own','press','third_party')),
CONSTRAINT "media_rights_require_credit" CHECK ("rights" = 'own' OR char_length(btrim(coalesce("credit",''))) > 0),
CONSTRAINT "media_source_url_valid" CHECK ("source_url" IS NULL OR "source_url" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "games" (
"id" serial PRIMARY KEY NOT NULL, "slug" text NOT NULL CONSTRAINT "games_slug_unique" UNIQUE, "title" text NOT NULL,
"description" text DEFAULT '' NOT NULL, "body" text DEFAULT '' NOT NULL, "developer" text, "publisher" text,
"release_date" timestamp with time zone, "platforms" text[] DEFAULT '{}' NOT NULL, "genres" text[] DEFAULT '{}' NOT NULL,
"external_source" text, "external_id" text, "status" text DEFAULT 'draft' NOT NULL, "cover_image_url" text,
"cover_alt" text, "cover_media_id" integer, "created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL, "version" integer DEFAULT 1 NOT NULL,
CONSTRAINT "games_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
CONSTRAINT "games_title_length" CHECK (char_length("title") BETWEEN 3 AND 120),
CONSTRAINT "games_description_length" CHECK (char_length("description") <= 240),
CONSTRAINT "games_external_source_valid" CHECK ("external_source" IS NULL OR "external_source" IN ('rawg','igdb','manual')),
CONSTRAINT "games_external_source_and_id_together" CHECK (("external_source" IS NULL AND "external_id" IS NULL) OR ("external_source" IS NOT NULL AND "external_id" IS NOT NULL)),
CONSTRAINT "games_status_valid" CHECK ("status" IN ('draft','published')),
CONSTRAINT "games_published_requires_cover" CHECK ("status" <> 'published' OR "cover_image_url" IS NOT NULL),
CONSTRAINT "games_cover_media_fk" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE "articles" (
"id" serial PRIMARY KEY NOT NULL, "kind" text NOT NULL, "slug" text DEFAULT '' NOT NULL, "title" text DEFAULT '' NOT NULL,
"description" text DEFAULT '' NOT NULL, "body" text DEFAULT '' NOT NULL, "published_at" timestamp with time zone, "author" text,
"tags" text[] DEFAULT '{}' NOT NULL, "cover_image_url" text, "cover_alt" text, "cover_media_id" integer,
"status" text DEFAULT 'draft' NOT NULL, "previous_status" text, "trashed_at" timestamp with time zone, "featured" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"version" integer DEFAULT 1 NOT NULL, "game_id" integer, "score" integer, "score_reason" text, "verdict" text,
"category" text, "source_name" text, "source_url" text, "seo_title" text, "seo_description" text, "og_image_url" text, "og_media_id" integer,
CONSTRAINT "articles_kind_valid" CHECK ("kind" IN ('review','news','guide')),
CONSTRAINT "articles_status_valid" CHECK ("status" IN ('draft','published','trashed')),
CONSTRAINT "articles_previous_status_valid" CHECK ("previous_status" IS NULL OR "previous_status" IN ('draft','published')),
CONSTRAINT "articles_title_len" CHECK (char_length("title") <= 120),
CONSTRAINT "articles_description_len" CHECK (char_length("description") <= 240),
CONSTRAINT "articles_seo_description_len" CHECK ("seo_description" IS NULL OR char_length("seo_description") <= 160),
CONSTRAINT "articles_slug_format" CHECK ("slug" = '' OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
CONSTRAINT "articles_source_url" CHECK ("source_url" IS NULL OR "source_url" ~* '^https?://'),
CONSTRAINT "articles_published_requires_date" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL),
CONSTRAINT "articles_trashed_requires_date" CHECK ("status" <> 'trashed' OR "trashed_at" IS NOT NULL),
CONSTRAINT "articles_trashed_requires_previous" CHECK ("status" <> 'trashed' OR "previous_status" IS NOT NULL),
CONSTRAINT "articles_publish_title" CHECK ("status" <> 'published' OR char_length(btrim("title")) BETWEEN 3 AND 120),
CONSTRAINT "articles_publish_slug" CHECK ("status" <> 'published' OR "slug" <> ''),
CONSTRAINT "articles_publish_body" CHECK ("status" <> 'published' OR char_length(btrim("body")) >= 10),
CONSTRAINT "articles_review_fields_only" CHECK ("kind" = 'review' OR ("game_id" IS NULL AND "score" IS NULL AND "score_reason" IS NULL AND "verdict" IS NULL)),
CONSTRAINT "articles_review_complete" CHECK ("kind" <> 'review' OR "status" <> 'published' OR ("game_id" IS NOT NULL AND "score" IS NOT NULL AND "score" BETWEEN 1 AND 10 AND char_length(btrim(coalesce("score_reason",''))) >= 20 AND char_length(btrim(coalesce("verdict",''))) >= 10)),
CONSTRAINT "articles_news_fields_only" CHECK ("kind" = 'news' OR ("category" IS NULL AND "source_name" IS NULL AND "source_url" IS NULL)),
CONSTRAINT "articles_news_category_len" CHECK ("category" IS NULL OR char_length("category") <= 40),
CONSTRAINT "articles_game_fk" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT,
CONSTRAINT "articles_cover_media_fk" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE RESTRICT,
CONSTRAINT "articles_og_media_fk" FOREIGN KEY ("og_media_id") REFERENCES "media"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
"id" serial PRIMARY KEY NOT NULL, "media_id" integer NOT NULL, "width" integer NOT NULL,
"storage_key" text NOT NULL CONSTRAINT "media_variants_storage_key_unique" UNIQUE, "public_url" text NOT NULL, "bytes" integer NOT NULL,
CONSTRAINT "media_variants_dimensions_positive" CHECK ("width" > 0), CONSTRAINT "media_variants_bytes_positive" CHECK ("bytes" > 0),
CONSTRAINT "media_variants_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE "article_revisions" (
"id" serial PRIMARY KEY NOT NULL, "article_id" integer NOT NULL, "version" integer NOT NULL, "snapshot" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "article_revisions_version_positive" CHECK ("version" > 0),
CONSTRAINT "article_revisions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE "sessions" (
"id" text PRIMARY KEY NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "expires_at" timestamp with time zone NOT NULL,
"last_used_at" timestamp with time zone DEFAULT now() NOT NULL, "absolute_expires_at" timestamp with time zone NOT NULL, "user_agent" text, "ip_hash" text,
CONSTRAINT "sessions_expiry_order" CHECK ("expires_at" <= "absolute_expires_at")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
"id" serial PRIMARY KEY NOT NULL, "ip_hash" text NOT NULL, "attempted_at" timestamp with time zone DEFAULT now() NOT NULL, "success" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
"id" serial PRIMARY KEY NOT NULL, "from_path" text NOT NULL CONSTRAINT "redirects_from_path_unique" UNIQUE, "to_path" text NOT NULL,
"status_code" integer DEFAULT 308 NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "redirects_status_code_valid" CHECK ("status_code" IN (301,302,307,308))
);
--> statement-breakpoint
CREATE TABLE "storage_orphans" (
"id" serial PRIMARY KEY NOT NULL, "storage_key" text NOT NULL, "action" text DEFAULT 'put' NOT NULL, "status" text DEFAULT 'pending' NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL, "repaired_at" timestamp with time zone,
CONSTRAINT "storage_orphans_action_valid" CHECK ("action" IN ('put','delete')),
CONSTRAINT "storage_orphans_status_valid" CHECK ("status" IN ('pending','repaired','failed'))
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
"job_name" text PRIMARY KEY NOT NULL, "last_success_at" timestamp with time zone, "last_run_at" timestamp with time zone DEFAULT now() NOT NULL,
"last_published_at" timestamp with time zone, "last_id" integer, "backup_restored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "games_external_idx" ON "games" USING btree ("external_source","external_id") WHERE "external_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "games_cover_media_idx" ON "games" USING btree ("cover_media_id");
--> statement-breakpoint
CREATE INDEX "games_platforms_idx" ON "games" USING gin ("platforms");
--> statement-breakpoint
CREATE INDEX "games_genres_idx" ON "games" USING gin ("genres");
--> statement-breakpoint
CREATE UNIQUE INDEX "articles_kind_slug_active" ON "articles" USING btree ("kind","slug") WHERE "status" <> 'trashed' AND "slug" <> '';
--> statement-breakpoint
CREATE INDEX "articles_visible_idx" ON "articles" USING btree ("kind","published_at") WHERE "status" = 'published';
--> statement-breakpoint
CREATE INDEX "articles_featured_idx" ON "articles" USING btree ("published_at") WHERE "featured" AND "status" = 'published';
--> statement-breakpoint
CREATE INDEX "articles_tags_idx" ON "articles" USING gin ("tags");
--> statement-breakpoint
CREATE INDEX "articles_game_idx" ON "articles" USING btree ("game_id");
--> statement-breakpoint
CREATE INDEX "articles_cover_media_idx" ON "articles" USING btree ("cover_media_id");
--> statement-breakpoint
CREATE INDEX "articles_og_media_idx" ON "articles" USING btree ("og_media_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "media_variants_media_width_unique" ON "media_variants" USING btree ("media_id","width");
--> statement-breakpoint
CREATE INDEX "media_variants_media_id_idx" ON "media_variants" USING btree ("media_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "article_revisions_article_version_unique" ON "article_revisions" USING btree ("article_id","version");
--> statement-breakpoint
CREATE INDEX "article_revisions_created_idx" ON "article_revisions" USING btree ("article_id","created_at");
--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip_hash","attempted_at");
--> statement-breakpoint
CREATE INDEX "login_attempts_attempted_idx" ON "login_attempts" USING btree ("attempted_at");
--> statement-breakpoint
CREATE INDEX "redirects_to_path_idx" ON "redirects" USING btree ("to_path");
--> statement-breakpoint
CREATE INDEX "storage_orphans_pending_idx" ON "storage_orphans" USING btree ("created_at") WHERE "status" = 'pending';
--> statement-breakpoint
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
