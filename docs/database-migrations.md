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

## Verified application (PostgreSQL 18.6)

The baseline was applied to an empty PostgreSQL 18.6 database on 11 November 2026 with `npm run db:migrate` and the following catalog was verified:

| Check                          | Result        |
| ------------------------------ | ------------- |
| Tables in `public`             | 10            |
| Indexes                        | 34            |
| Constraints (all types)        | 122           |
| Check constraints              | 38            |
| Triggers (non-internal)        | 4             |
| `drizzle.__drizzle_migrations` | 1 applied row |

Tables: `articles`, `article_revisions`, `cron_runs`, `games`, `login_attempts`, `media`, `media_variants`, `redirects`, `sessions`, `storage_orphans`.

Triggers: `articles_set_updated_at`, `articles_validate_tags`, `games_set_updated_at`, `redirects_validate`.

The check constraints also reject incomplete reviews and invalid publication states at the database level, not only in Zod.

CI repeats this procedure in the `integration` job (`postgres:18` service) before running `npm run test:db` and `npm run test:http`.

## Runtime schema is the source of truth

This baseline follows the current `src/db/schema.ts` types. It intentionally keeps `release_date` as `timestamptz`, revision snapshots as `text`, and ids as `serial`, because those are the current runtime contracts. Older design documents describe different types in places; do not silently migrate those types until application code is updated with them.

Before connecting Neon:

1. Run `npm run db:generate` and inspect generated SQL/snapshot output.
2. Apply migrations to a disposable empty PostgreSQL database using `npm run db:migrate`.
3. Compare the database catalog against Drizzle and verify trigger behavior.
4. Do not run this initial baseline against a database that already has tables without an explicit baseline/introspection procedure.
