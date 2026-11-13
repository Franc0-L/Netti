# Database migrations

## Commands

- `npm run db:generate`: generate an incremental migration from `src/db/schema.ts`.
- `npm run db:migrate`: apply migrations recorded in `src/db/migrations/meta/_journal.json`.
- `npm run db:baseline`: record the migration history of a database that was created before the migrations were tracked.
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

## Incremental 0002 — reconciliation of legacy databases

`0002_reconcile_legacy_schema.sql` brings a database that predates the tracked baseline to the canonical schema. It is idempotent: every statement creates only what is missing, so the file is a no-op on a database already migrated from 0000/0001.

- Creates the baseline functions and triggers: `set_updated_at`, `validate_article_tags`, `validate_redirect`, `articles_set_rarity`.
- Adds the missing check constraints, foreign keys and secondary indexes of the canonical schema, including `storage_orphans_status_valid`.
- Creates `score_rarities`, `articles.score_details` and `articles.rarity_key` with their constraints, so the file also replaces the work of 0001 on a legacy database.
- Deletes the duplicated `article_revisions` rows that legacy databases stored for the same `(article_id, version)` before the version trigger existed. The newest snapshot of each version is kept, because that is the state the article ended in.

`npm run test:migrations` exercises two paths against disposable databases: a fresh database that receives every migration in order, and a legacy database (`scripts/fixtures/legacy-schema.sql`) that receives only 0002. Both must end with the same catalog, the same derived rarities and the same rejections.

## Baseline of a database created outside Drizzle

A database that already has the runtime tables cannot replay 0000, so its history must be recorded first:

```bash
npm run db:baseline -- 0000_initial_schema 0001_score_rarity
npm run db:migrate
```

`db:baseline` creates the `drizzle.__drizzle_migrations` table and stores the sha256 hash and the journal timestamp of each migration, so `db:migrate` then applies only the pending ones. It never records the same migration twice, and it prints the target host before writing.

The script reads `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`) from the environment; when neither is set it loads `.env.local`, which points to the production instance. `npm run test:baseline` rehearses the whole flow — legacy schema, baseline, migrate — on a disposable local database.

Take a backup before running either command against a remote instance:

```bash
npm run db:backup
```

## Drizzle snapshots

The migration SQL is written by hand, so `src/db/migrations/meta/` only carries the snapshot of the latest state (`0002_snapshot.json`). Without it, `npm run db:generate` would diff against nothing and emit a migration that recreates every table. With it, the command reports "No schema changes" when `src/db/schema.ts` and the database agree. When a migration changes the schema, regenerate the snapshot in the same commit.

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

## Production instance

The Neon database (`neondb`) was created outside Drizzle: it carried the ten tables without checks, foreign keys, triggers, functions or secondary indexes, and without a migration history. On 13 November 2026 it was backed up with `npm run db:backup`, baselined for 0000 and 0001, and reconciled with 0002 through `npm run db:migrate`. The catalog now matches the local one: 11 tables, 38 indexes, 7 foreign keys, 43 check constraints, 5 triggers, 6 rarities and 3 rows in `drizzle.__drizzle_migrations`. A score of 93 derives `mythic` and a score of 120 is rejected.

## Runtime schema is the source of truth

This baseline follows the current `src/db/schema.ts` types. It intentionally keeps `release_date` as `timestamptz`, revision snapshots as `text`, and ids as `serial`, because those are the current runtime contracts. Older design documents describe different types in places; do not silently migrate those types until application code is updated with them.

Before connecting Neon:

1. Run `npm run db:generate` and inspect generated SQL/snapshot output.
2. Apply migrations to a disposable empty PostgreSQL database using `npm run db:migrate`.
3. Compare the database catalog against Drizzle and verify trigger behavior.
4. Do not run this initial baseline against a database that already has tables without the explicit baseline/introspection procedure described above.
