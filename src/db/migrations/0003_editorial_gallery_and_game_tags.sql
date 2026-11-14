CREATE TABLE "article_gallery" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"media_id" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_gallery_position_valid" CHECK ("article_gallery"."position" between 0 and 19)
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "pros" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "cons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "video_title" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "article_gallery" ADD CONSTRAINT "article_gallery_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_gallery" ADD CONSTRAINT "article_gallery_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_gallery_article_position_unique" ON "article_gallery" USING btree ("article_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "article_gallery_article_media_unique" ON "article_gallery" USING btree ("article_id","media_id");--> statement-breakpoint
CREATE INDEX "article_gallery_media_id_idx" ON "article_gallery" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "articles_pending_activation_idx" ON "articles" USING btree ("published_at","id") WHERE "articles"."status" = 'published';--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category","published_at") WHERE "articles"."kind" = 'news' and "articles"."status" = 'published';--> statement-breakpoint
CREATE INDEX "games_tags_idx" ON "games" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "games_published_idx" ON "games" USING btree ("created_at","id") WHERE "games"."status" = 'published';--> statement-breakpoint
CREATE INDEX "games_featured_idx" ON "games" USING btree ("created_at","id") WHERE "games"."featured" and "games"."status" = 'published';--> statement-breakpoint
CREATE INDEX "games_release_date_idx" ON "games" USING btree ("release_date");--> statement-breakpoint
CREATE INDEX "media_pending_delete_idx" ON "media" USING btree ("pending_delete_at") WHERE "media"."pending_delete_at" is not null;--> statement-breakpoint
CREATE OR REPLACE FUNCTION article_bullet_list_valid(items text[]) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  item text;
  item_count integer := 0;
BEGIN
  IF items IS NULL THEN RETURN true; END IF;
  IF cardinality(items) > 5 THEN RETURN false; END IF;
  FOR item IN SELECT unnest(items) LOOP
    IF item IS NULL OR char_length(btrim(item)) = 0 THEN RETURN false; END IF;
    IF char_length(btrim(item)) > 200 THEN RETURN false; END IF;
    item_count := item_count + 1;
  END LOOP;
  RETURN item_count = cardinality(items);
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_pros_limit" CHECK (cardinality("articles"."pros") <= 5);--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cons_limit" CHECK (cardinality("articles"."cons") <= 5);--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_pros_items_valid" CHECK (article_bullet_list_valid("articles"."pros"));--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cons_items_valid" CHECK (article_bullet_list_valid("articles"."cons"));--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_video_url_valid" CHECK ("articles"."video_url" is null or "articles"."video_url" ~* '^https?://');--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_video_title_len" CHECK ("articles"."video_title" is null or char_length("articles"."video_title") <= 200);--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_video_together" CHECK (("articles"."video_url" is null and "articles"."video_title" is null) or ("articles"."video_url" is not null and "articles"."video_title" is not null));