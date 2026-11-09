import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  slug: text("slug").notNull().default(""),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  body: text("body").notNull().default(""),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  author: text("author"),
  tags: text("tags").array().notNull().default([]),
  coverImageUrl: text("cover_image_url"),
  coverAlt: text("cover_alt"),
  coverMediaId: integer("cover_media_id"),
  status: text("status").notNull().default("draft"),
  previousStatus: text("previous_status"),
  trashedAt: timestamp("trashed_at", { withTimezone: true }),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  version: integer("version").notNull().default(1),
  gameId: integer("game_id"),
  score: integer("score"),
  scoreReason: text("score_reason"),
  verdict: text("verdict"),
  category: text("category"),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  ogImageUrl: text("og_image_url"),
  ogMediaId: integer("og_media_id"),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  body: text("body").notNull().default(""),
  developer: text("developer"),
  publisher: text("publisher"),
  releaseDate: timestamp("release_date", { withTimezone: true }),
  platforms: text("platforms").array().notNull().default([]),
  genres: text("genres").array().notNull().default([]),
  externalSource: text("external_source"),
  externalId: text("external_id"),
  status: text("status").notNull().default("draft"),
  coverImageUrl: text("cover_image_url"),
  coverAlt: text("cover_alt"),
  coverMediaId: integer("cover_media_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  version: integer("version").notNull().default(1),
});

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  storageKey: text("storage_key").notNull().unique(),
  publicUrl: text("public_url").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  contentType: text("content_type").notNull().default("image/webp"),
  alt: text("alt"),
  credit: text("credit"),
  rights: text("rights").notNull().default("own"),
  sourceUrl: text("source_url"),
  pendingDeleteAt: timestamp("pending_delete_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mediaVariants = pgTable("media_variants", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  width: integer("width").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  publicUrl: text("public_url").notNull(),
  bytes: integer("bytes").notNull(),
});

export const articleRevisions = pgTable("article_revisions", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  absoluteExpiresAt: timestamp("absolute_expires_at", {
    withTimezone: true,
  }).notNull(),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
});

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  ipHash: text("ip_hash").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  success: boolean("success").notNull().default(false),
});

export const redirects = pgTable("redirects", {
  id: serial("id").primaryKey(),
  fromPath: text("from_path").notNull().unique(),
  toPath: text("to_path").notNull(),
  statusCode: integer("status_code").notNull().default(308),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const storageOrphans = pgTable("storage_orphans", {
  id: serial("id").primaryKey(),
  storageKey: text("storage_key").notNull(),
  action: text("action").notNull().default("put"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  repairedAt: timestamp("repaired_at", { withTimezone: true }),
});

export const cronRuns = pgTable("cron_runs", {
  jobName: text("job_name").notNull().primaryKey(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastPublishedAt: timestamp("last_published_at", { withTimezone: true }),
  lastId: integer("last_id"),
  backupRestoredAt: timestamp("backup_restored_at", { withTimezone: true }),
});
