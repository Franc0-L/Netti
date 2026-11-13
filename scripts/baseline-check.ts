// Applies the legacy fixture to a disposable database and exercises the
// baseline + migration flow used against the production instance:
//
//   1. the legacy schema is created (no drizzle history),
//   2. `db:baseline` records the already reconciled migrations,
//   3. `db:migrate` applies only the pending ones.
//
// The database is created and dropped by this script.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

function loadEnvFile(path: string): void {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvFile('.env');

const baseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!baseUrl) throw new Error('DATABASE_URL is missing');
const url = new URL(baseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
  throw new Error(`Refusing to run against a non-local host: ${url.hostname}`);
}

const dbName = 'netti_baseline_check';
const dbUrl = new URL(url.toString());
dbUrl.pathname = `/${dbName}`;

async function dropDatabase(): Promise<void> {
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
}

function run(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(process.execPath, args, { stdio: 'inherit', env });
}

async function main(): Promise<void> {
  await dropDatabase();

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    await client.query(readFileSync('scripts/fixtures/legacy-schema.sql', 'utf8'));
    await client.query('SET search_path TO public');
    const tables = await client.query(
      `select count(*)::int as count from pg_tables where schemaname='public'`
    );
    console.log(`legacy tables: ${tables.rows[0].count}`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_URL_UNPOOLED: dbUrl.toString() };

  // The baseline records the migrations that the legacy schema already covers.
  run(
    [
      'node_modules/tsx/dist/cli.mjs',
      'scripts/baseline-migrations.ts',
      '0000_initial_schema',
      '0001_score_rarity',
    ],
    env
  );

  // The migrator must now apply only the pending migration.
  run(['node_modules/drizzle-kit/bin.cjs', 'migrate'], env);

  const verify = new Client({ connectionString: dbUrl.toString() });
  await verify.connect();
  try {
    const history = await verify.query(
      'select created_at from "drizzle"."__drizzle_migrations" order by created_at'
    );
    const timestamps = history.rows.map((row) => Number(row.created_at));
    console.log(`history rows: ${timestamps.length}`);
    if (timestamps.length !== 3) {
      throw new Error(`expected 3 history rows, got ${timestamps.length}`);
    }

    const rarities = await verify.query('select count(*)::int as count from score_rarities');
    if (rarities.rows[0]?.count !== 6) {
      throw new Error(`expected 6 rarities, got ${rarities.rows[0]?.count}`);
    }

    const columns = await verify.query(
      `select column_name from information_schema.columns
        where table_name='articles' and column_name in ('score_details','rarity_key')`
    );
    if (columns.rowCount !== 2) {
      throw new Error('the score columns are missing');
    }

    const trigger = await verify.query(
      `select 1 from pg_trigger where tgname='articles_set_rarity' and not tgisinternal`
    );
    if (trigger.rowCount !== 1) throw new Error('the rarity trigger is missing');
    console.log('baseline flow: ok');
  } finally {
    await verify.end();
  }

  await dropDatabase();
  console.log('baseline check finished');
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await dropDatabase().catch(() => undefined);
  process.exitCode = 1;
});
