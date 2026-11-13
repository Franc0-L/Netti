# Database migrations

## Commands

- `npm run db:generate`: generate an incremental migration from `src/db/schema.ts`.
- `npm run db:migrate`: apply migrations recorded in `src/db/migrations/meta/_journal.json`.
- `npm run db:studio`: open Drizzle Studio.

`drizzle.config.ts` reads **`DATABASE_URL_UNPOOLED`**, not `DATABASE_URL`. Migrations must run over a direct (unpooled) PostgreSQL connection and never from a Vercel Function.

```bash
DATABASE_URL_UNPOOLED=postgresql://user:pass@host:5432/db npm run db:migrate
```

`DATABASE_URL` (pooled) is only used by the running application through `src/db/index.ts`.

## Baseline 0000

`0000_initial_schema.sql` defines the ten runtime tables, foreign keys, checks, partial/GIN indexes, and triggers for timestamp maintenance, tag validation, and redirect-cycle prevention.

The baseline is versioned and registered in Drizzle's journal.

## Incremental 0001 — score and rarity

`0001_score_rarity.sql` extends the baseline without dropping tables or data:

- Creates `score_rarities` (key, label, color token, score range, position) and seeds the six bands: Mítica ≥90, Legendaria ≥80, Épica ≥60, Rara ≥40, Poco común ≥20, Común <20.
- Adds `articles.score_details` (JSONB) and `articles.rarity_key` (FK to `score_rarities`, `ON DELETE RESTRICT`) with the index `articles_rarity_idx`.
- Replaces `articles_review_fields_only` and `articles_review_complete` with their 0-100 versions, and adds `articles_score_valid` and `articles_score_details_valid`.
- Adds the immutable function `article_score_details_valid(jsonb)` and the trigger `articles_set_rarity`, which derives the rarity band from the score on every insert and update.

The migration only drops the two review constraints it immediately recreates; the test suite asserts that no table, schema, type or index is dropped.

## Verified application (PostgreSQL 18.6)

The migrations were applied to an empty PostgreSQL 18.6 database on 12 November 2026 with `npm run db:migrate` and the following catalog was verified:

| Check                          | Result         |
| ------------------------------ | -------------- |
| Tables in `public`             | 11             |
| Indexes                        | 38             |
| Constraints (all types)        | 137            |
| Check constraints              | 43             |
| Triggers (non-internal)        | 5              |
| `drizzle.__drizzle_migrations` | 2 applied rows |

Tables: `articles`, `article_revisions`, `cron_runs`, `games`, `login_attempts`, `media`, `media_variants`, `redirects`, `score_rarities`, `sessions`, `storage_orphans`.

Triggers: `articles_set_rarity`, `articles_set_updated_at`, `articles_validate_tags`, `games_set_updated_at`, `redirects_validate`.

The check constraints also reject incomplete reviews and invalid publication states at the database level, not only in Zod.

`npm run test:migrations` applies both migrations to a disposable database, verifies the catalog, checks the rarity derivation on every band boundary and confirms that invalid sub-scores and out-of-range scores are rejected. The database is created and dropped by the script.

CI repeats this procedure in the `integration` job (`postgres:18` service) before running `npm run test:db` and `npm run test:http`.

## Runtime schema is the source of truth

This baseline follows the current `src/db/schema.ts` types. It intentionally keeps `release_date` as `timestamptz`, revision snapshots as `text`, and ids as `serial`, because those are the current runtime contracts. Older design documents describe different types in places; do not silently migrate those types until application code is updated with them.

Before connecting Neon:

1. Run `npm run db:generate` and inspect generated SQL/snapshot output.
2. Apply migrations to a disposable empty PostgreSQL database using `npm run db:migrate`.
3. Compare the database catalog against Drizzle and verify trigger behavior.
4. Do not run this initial baseline against a database that already has tables without an explicit baseline/introspection procedure.
