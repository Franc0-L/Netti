import { boolean, check, foreignKey, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const media = pgTable("media", {
 id: serial("id").primaryKey(), storageKey: text("storage_key").notNull().unique(), publicUrl: text("public_url").notNull(),
 width: integer("width").notNull(), height: integer("height").notNull(), bytes: integer("bytes").notNull(),
 contentType: text("content_type").notNull().default("image/webp"), alt: text("alt"), credit: text("credit"),
 rights: text("rights").notNull().default("own"), sourceUrl: text("source_url"),
 pendingDeleteAt: timestamp("pending_delete_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
 check("media_dimensions_positive", sql`${t.width} > 0 and ${t.height} > 0`), check("media_bytes_positive", sql`${t.bytes} > 0`),
 check("media_webp_only", sql`${t.contentType} = 'image/webp'`), check("media_rights_valid", sql`${t.rights} in ('own', 'press', 'third_party')`),
 check("media_rights_require_credit", sql`${t.rights} = 'own' or char_length(btrim(coalesce(${t.credit}, ''))) > 0`),
 check("media_source_url_valid", sql`${t.sourceUrl} is null or ${t.sourceUrl} ~* '^https?://'`),
]);

export const games = pgTable("games", {
 id: serial("id").primaryKey(), slug: text("slug").notNull().unique(), title: text("title").notNull(),
 description: text("description").notNull().default(""), body: text("body").notNull().default(""),
 developer: text("developer"), publisher: text("publisher"), releaseDate: timestamp("release_date", { withTimezone: true }),
 platforms: text("platforms").array().notNull().default([]), genres: text("genres").array().notNull().default([]),
 externalSource: text("external_source"), externalId: text("external_id"), status: text("status").notNull().default("draft"),
 coverImageUrl: text("cover_image_url"), coverAlt: text("cover_alt"), coverMediaId: integer("cover_media_id"),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), version: integer("version").notNull().default(1),
}, (t) => [
 check("games_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
 check("games_title_length", sql`char_length(${t.title}) between 3 and 120`),
 check("games_description_length", sql`char_length(${t.description}) <= 240`),
 check("games_external_source_valid", sql`${t.externalSource} is null or ${t.externalSource} in ('rawg', 'igdb', 'manual')`),
 check("games_external_source_and_id_together", sql`(${t.externalSource} is null and ${t.externalId} is null) or (${t.externalSource} is not null and ${t.externalId} is not null)`),
 check("games_status_valid", sql`${t.status} in ('draft', 'published')`),
 check("games_published_requires_cover", sql`${t.status} <> 'published' or ${t.coverImageUrl} is not null`),
 foreignKey({ name: "games_cover_media_fk", columns: [t.coverMediaId], foreignColumns: [media.id] }).onDelete("restrict"),
 index("games_cover_media_idx").on(t.coverMediaId),
 uniqueIndex("games_external_idx").on(t.externalSource, t.externalId).where(sql`${t.externalId} is not null`),
 index("games_platforms_idx").using("gin", t.platforms), index("games_genres_idx").using("gin", t.genres),
]);

export const articles = pgTable("articles", {
 id: serial("id").primaryKey(), kind: text("kind").notNull(), slug: text("slug").notNull().default(""),
 title: text("title").notNull().default(""), description: text("description").notNull().default(""), body: text("body").notNull().default(""),
 publishedAt: timestamp("published_at", { withTimezone: true }), author: text("author"), tags: text("tags").array().notNull().default([]),
 coverImageUrl: text("cover_image_url"), coverAlt: text("cover_alt"), coverMediaId: integer("cover_media_id"),
 status: text("status").notNull().default("draft"), previousStatus: text("previous_status"), trashedAt: timestamp("trashed_at", { withTimezone: true }),
 featured: boolean("featured").notNull().default(false), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), version: integer("version").notNull().default(1),
 gameId: integer("game_id"), score: integer("score"), scoreReason: text("score_reason"), verdict: text("verdict"),
 category: text("category"), sourceName: text("source_name"), sourceUrl: text("source_url"), seoTitle: text("seo_title"),
 seoDescription: text("seo_description"), ogImageUrl: text("og_image_url"), ogMediaId: integer("og_media_id"),
}, (t) => [
 check("articles_kind_valid", sql`${t.kind} in ('review', 'news', 'guide')`),
 check("articles_status_valid", sql`${t.status} in ('draft', 'published', 'trashed')`),
 check("articles_previous_status_valid", sql`${t.previousStatus} is null or ${t.previousStatus} in ('draft', 'published')`),
 check("articles_title_len", sql`char_length(${t.title}) <= 120`), check("articles_description_len", sql`char_length(${t.description}) <= 240`),
 check("articles_seo_description_len", sql`${t.seoDescription} is null or char_length(${t.seoDescription}) <= 160`),
 check("articles_slug_format", sql`${t.slug} = '' or ${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
 check("articles_source_url", sql`${t.sourceUrl} is null or ${t.sourceUrl} ~* '^https?://'`),
 check("articles_published_requires_date", sql`${t.status} <> 'published' or ${t.publishedAt} is not null`),
 check("articles_trashed_requires_date", sql`${t.status} <> 'trashed' or ${t.trashedAt} is not null`),
 check("articles_trashed_requires_previous", sql`${t.status} <> 'trashed' or ${t.previousStatus} is not null`),
 check("articles_publish_title", sql`${t.status} <> 'published' or char_length(btrim(${t.title})) between 3 and 120`),
 check("articles_publish_slug", sql`${t.status} <> 'published' or ${t.slug} <> ''`),
 check("articles_publish_body", sql`${t.status} <> 'published' or char_length(btrim(${t.body})) >= 10`),
 check("articles_review_fields_only", sql`${t.kind} = 'review' or (${t.gameId} is null and ${t.score} is null and ${t.scoreReason} is null and ${t.verdict} is null)`),
 check("articles_review_complete", sql`${t.kind} <> 'review' or ${t.status} <> 'published' or (${t.gameId} is not null and ${t.score} is not null and ${t.score} between 1 and 10 and char_length(btrim(coalesce(${t.scoreReason}, ''))) >= 20 and char_length(btrim(coalesce(${t.verdict}, ''))) >= 10)`),
 check("articles_news_fields_only", sql`${t.kind} = 'news' or (${t.category} is null and ${t.sourceName} is null and ${t.sourceUrl} is null)`),
 check("articles_news_category_len", sql`${t.category} is null or char_length(${t.category}) <= 40`),
 foreignKey({ name: "articles_game_fk", columns: [t.gameId], foreignColumns: [games.id] }).onDelete("restrict"),
 foreignKey({ name: "articles_cover_media_fk", columns: [t.coverMediaId], foreignColumns: [media.id] }).onDelete("restrict"),
 foreignKey({ name: "articles_og_media_fk", columns: [t.ogMediaId], foreignColumns: [media.id] }).onDelete("restrict"),
 uniqueIndex("articles_kind_slug_active").on(t.kind, t.slug).where(sql`${t.status} <> 'trashed' and ${t.slug} <> ''`),
 index("articles_visible_idx").on(t.kind, t.publishedAt).where(sql`${t.status} = 'published'`),
 index("articles_featured_idx").on(t.publishedAt).where(sql`${t.featured} and ${t.status} = 'published'`),
 index("articles_tags_idx").using("gin", t.tags), index("articles_game_idx").on(t.gameId),
 index("articles_cover_media_idx").on(t.coverMediaId), index("articles_og_media_idx").on(t.ogMediaId),
]);

export const mediaVariants = pgTable("media_variants", {
 id: serial("id").primaryKey(), mediaId: integer("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
 width: integer("width").notNull(), storageKey: text("storage_key").notNull().unique(), publicUrl: text("public_url").notNull(), bytes: integer("bytes").notNull(),
}, (t) => [
 check("media_variants_dimensions_positive", sql`${t.width} > 0`), check("media_variants_bytes_positive", sql`${t.bytes} > 0`),
 uniqueIndex("media_variants_media_width_unique").on(t.mediaId, t.width), index("media_variants_media_id_idx").on(t.mediaId),
]);

export const articleRevisions = pgTable("article_revisions", {
 id: serial("id").primaryKey(), articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
 version: integer("version").notNull(), snapshot: text("snapshot").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
 check("article_revisions_version_positive", sql`${t.version} > 0`),
 uniqueIndex("article_revisions_article_version_unique").on(t.articleId, t.version), index("article_revisions_created_idx").on(t.articleId, t.createdAt),
]);

export const sessions = pgTable("sessions", {
 id: text("id").primaryKey(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
 absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(), userAgent: text("user_agent"), ipHash: text("ip_hash"),
}, (t) => [check("sessions_expiry_order", sql`${t.expiresAt} <= ${t.absoluteExpiresAt}`), index("sessions_expiry_idx").on(t.expiresAt)]);

export const loginAttempts = pgTable("login_attempts", {
 id: serial("id").primaryKey(), ipHash: text("ip_hash").notNull(), attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
 success: boolean("success").notNull().default(false),
}, (t) => [index("login_attempts_ip_time_idx").on(t.ipHash, t.attemptedAt), index("login_attempts_attempted_idx").on(t.attemptedAt)]);

export const redirects = pgTable("redirects", {
 id: serial("id").primaryKey(), fromPath: text("from_path").notNull().unique(), toPath: text("to_path").notNull(),
 statusCode: integer("status_code").notNull().default(308), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("redirects_status_code_valid", sql`${t.statusCode} in (301, 302, 307, 308)`), index("redirects_to_path_idx").on(t.toPath)]);

export const storageOrphans = pgTable("storage_orphans", {
 id: serial("id").primaryKey(), storageKey: text("storage_key").notNull(), action: text("action").notNull().default("put"),
 status: text("status").notNull().default("pending"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 repairedAt: timestamp("repaired_at", { withTimezone: true }),
}, (t) => [
 check("storage_orphans_action_valid", sql`${t.action} in ('put', 'delete')`),
 check("storage_orphans_status_valid", sql`${t.status} in ('pending', 'repaired', 'failed')`),
 index("storage_orphans_pending_idx").on(t.createdAt).where(sql`${t.status} = 'pending'`),
]);

export const cronRuns = pgTable("cron_runs", {
 jobName: text("job_name").notNull().primaryKey(), lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
 lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull().defaultNow(),
 lastPublishedAt: timestamp("last_published_at", { withTimezone: true }), lastId: integer("last_id"), backupRestoredAt: timestamp("backup_restored_at", { withTimezone: true }),
});
