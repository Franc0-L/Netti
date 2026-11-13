CREATE TABLE "score_rarities" (
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
('common', 'Común', 'neutral', 0, 19, 6);
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
ALTER TABLE "articles" ADD COLUMN "score_details" jsonb;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "rarity_key" text;
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_rarity_fk" FOREIGN KEY ("rarity_key") REFERENCES "score_rarities" ("key") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "articles_rarity_idx" ON "articles" USING btree ("rarity_key");
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT "articles_review_fields_only";
--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT "articles_review_complete";
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_review_fields_only" CHECK ("kind" = 'review' OR ("game_id" IS NULL AND "score" IS NULL AND "score_details" IS NULL AND "rarity_key" IS NULL AND "score_reason" IS NULL AND "verdict" IS NULL));
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_score_valid" CHECK ("score" IS NULL OR "score" between 0 and 100);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_score_details_valid" CHECK ("score_details" IS NULL OR article_score_details_valid("score_details"));
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_review_complete" CHECK ("kind" <> 'review' OR "status" <> 'published' OR ("game_id" IS NOT NULL AND "score" IS NOT NULL AND "score" between 0 AND 100 AND char_length(btrim(coalesce("score_reason",''))) >= 20 AND char_length(btrim(coalesce("verdict",''))) >= 10));
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
CREATE TRIGGER "articles_set_rarity" BEFORE INSERT OR UPDATE ON "articles" FOR EACH ROW EXECUTE FUNCTION articles_set_rarity();
