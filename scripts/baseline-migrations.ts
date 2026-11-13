// Baselines the drizzle migration history of a database that was created
// before the migrations were tracked (the production Neon instance).
//
// The legacy database already carries the ten runtime tables, so the baseline
// cannot be replayed there. This script records the already reconciled
// migrations in `drizzle.__drizzle_migrations` so that `npm run db:migrate`
// only applies the pending ones.
//
// Usage:
//   npm run db:baseline -- 0000_initial_schema 0001_score_rarity
//
// The connection string comes from DATABASE_URL_UNPOOLED (or DATABASE_URL).
// When neither is set in the environment, `.env.local` is loaded, which points
// to the production instance. The script never records a migration twice.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

function loadEnvFile(path: string): void {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const MIGRATION_DIR = 'src/db/migrations';
const JOURNAL = `${MIGRATION_DIR}/meta/_journal.json`;

type JournalEntry = { idx: number; when: number; tag: string };

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(JOURNAL, 'utf8')) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  if (requested.length === 0) {
    throw new Error('Usage: npm run db:baseline -- <migration tag> [...migration tags]');
  }

  if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
    loadEnvFile('.env.local');
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED is missing');
  const url = new URL(connectionString);
  console.log(`target: ${url.hostname}/${url.pathname.replace(/^\//, '')}`);

  const journal = readJournal();
  const entries = requested.map((tag) => {
    const entry = journal.find((item) => item.tag === tag);
    if (!entry) throw new Error(`unknown migration tag: ${tag}`);
    return entry;
  });

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await client.query(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
         id SERIAL PRIMARY KEY,
         hash text NOT NULL,
         created_at bigint
       )`
    );

    for (const entry of entries) {
      const sql = readFileSync(`${MIGRATION_DIR}/${entry.tag}.sql`, 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query(
        'select id from "drizzle"."__drizzle_migrations" where hash = $1',
        [hash]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        console.log(`${entry.tag}: already recorded`);
        continue;
      }
      await client.query(
        'insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)',
        [hash, entry.when]
      );
      console.log(`${entry.tag}: recorded (hash ${hash.slice(0, 12)}, when ${entry.when})`);
    }

    const history = await client.query(
      'select id, hash, created_at from "drizzle"."__drizzle_migrations" order by created_at'
    );
    console.log(`history rows: ${history.rowCount}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
