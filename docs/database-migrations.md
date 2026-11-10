# Database migrations

## Commands

- npm run db:generate: generate an incremental migration from src/db/schema.ts.
- npm run db:migrate: apply migrations recorded in src/db/migrations/meta/_journal.json.
- npm run db:studio: open Drizzle Studio.

Use DATABASE_URL with a direct, unpooled PostgreSQL connection for migration commands. Never run migrations from a Vercel Function.

## Baseline 0000

0000_initial_schema.sql defines the ten runtime tables, foreign keys, checks, partial/GIN indexes, and triggers for version maintenance, tag validation, and redirect-cycle prevention.

The SQL baseline is versioned and registered in Drizzle's journal. The GitHub connector can edit repository files but cannot execute the local CLI. Therefore this baseline is not represented as output from an executed drizzle-kit generate command, and it has not been applied to Neon. The Drizzle commands are configured for subsequent generation and application in a CLI-enabled development environment.

## Runtime schema is the source of truth

This baseline follows the current src/db/schema.ts types. It intentionally keeps release_date as timestamptz, revision snapshots as text, and ids as serial, because those are the current runtime contracts. Older design documents describe different types in places; do not silently migrate those types until application code is updated with them.

Before connecting Neon:
1. Run npm run db:generate and inspect generated SQL/snapshot output.
2. Apply migrations to a disposable empty PostgreSQL database using npm run db:migrate.
3. Compare the database catalog against Drizzle and verify trigger behavior.
4. Do not run this initial baseline against a database that already has tables without an explicit baseline/introspection procedure.
