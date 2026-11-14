ALTER TABLE "games" DROP CONSTRAINT "games_status_valid";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "previous_status" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "trashed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_previous_status_valid" CHECK ("games"."previous_status" is null or "games"."previous_status" in ('draft', 'published'));--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_trashed_requires_date" CHECK ("games"."status" <> 'trashed' or "games"."trashed_at" is not null);--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_trashed_requires_previous" CHECK ("games"."status" <> 'trashed' or "games"."previous_status" is not null);--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_status_valid" CHECK ("games"."status" in ('draft', 'published', 'trashed'));