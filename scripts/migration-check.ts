// Applies the migrations to a disposable database and verifies the score /
// rarity contract. The target database is created and dropped by this script.
import { readdirSync, readFileSync } from 'node:fs';
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
const dbName = 'netti_migration_check';
url.pathname = `/${dbName}`;

async function dropDatabase(): Promise<void> {
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
}

async function main(): Promise<void> {
  await dropDatabase();

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  const dir = 'src/db/migrations';
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(`${dir}/${file}`, 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await client.query(statement);
    }
    console.log(`applied ${file} (${statements.length} statements)`);
  }

  const checks: Array<[string, string]> = [
    ['tables', `select count(*)::int as count from pg_tables where schemaname='public'`],
    ['triggers', `select count(*)::int as count from pg_trigger where not tgisinternal`],
    [
      'checks',
      `select count(*)::int as count from pg_constraint where contype='c' and connamespace='public'::regnamespace`,
    ],
    ['rarities', `select count(*)::int as count from score_rarities`],
  ];
  for (const [name, sql] of checks) {
    const result = await client.query(sql);
    console.log(`${name}: ${result.rows[0]?.count}`);
  }

  // Rarity is derived from the score by the trigger.
  for (const [score, expected] of [
    [0, 'common'],
    [19, 'common'],
    [20, 'uncommon'],
    [39, 'uncommon'],
    [40, 'rare'],
    [59, 'rare'],
    [60, 'epic'],
    [79, 'epic'],
    [80, 'legendary'],
    [89, 'legendary'],
    [90, 'mythic'],
    [100, 'mythic'],
  ] as const) {
    const inserted = await client.query(
      `insert into articles (kind, slug, title, body, score, status) values ('review', $1, 'Test', 'Cuerpo', $2, 'draft') returning rarity_key`,
      [`score-${score}`, score]
    );
    const actual = inserted.rows[0]?.rarity_key;
    if (actual !== expected) throw new Error(`score ${score}: expected ${expected}, got ${actual}`);
  }
  console.log('rarity derivation: ok');

  // Valid score details are accepted.
  await client.query(
    `insert into articles (kind, slug, title, body, score, score_details, status) values ('review', 'details-ok', 'Test', 'Cuerpo', 80, '{"story":8,"gameplay":9,"visual":7}'::jsonb, 'draft')`
  );
  console.log('score details accepted: ok');

  // Invalid score details are rejected by the database.
  for (const details of [
    '{"story":11}',
    '{"story":0}',
    '{"story":8.5}',
    '{"story":"8"}',
    '{"pace":8}',
    '{}',
  ]) {
    let failed = false;
    try {
      await client.query(
        `insert into articles (kind, slug, title, body, score, score_details, status) values ('review', $1, 'Test', 'Cuerpo', 80, $2::jsonb, 'draft')`,
        [`details-bad-${Math.random().toString(36).slice(2, 8)}`, details]
      );
    } catch {
      failed = true;
    }
    if (!failed) throw new Error(`score details ${details} should have been rejected`);
  }
  console.log('score details rejected: ok');

  // Scores outside the range are rejected.
  let scoreFailed = false;
  try {
    await client.query(
      `insert into articles (kind, slug, title, body, score, status) values ('review', 'score-bad', 'Test', 'Cuerpo', 101, 'draft')`
    );
  } catch {
    scoreFailed = true;
  }
  if (!scoreFailed) throw new Error('score 101 should have been rejected');
  console.log('score range: ok');

  // A non-review article cannot carry review fields.
  let kindFailed = false;
  try {
    await client.query(
      `insert into articles (kind, slug, title, body, score, status) values ('news', 'news-score', 'Test', 'Cuerpo', 90, 'draft')`
    );
  } catch {
    kindFailed = true;
  }
  if (!kindFailed) throw new Error('news with score should have been rejected');
  console.log('review fields only: ok');

  await client.end();
  await dropDatabase();
  console.log('migration check finished');
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await dropDatabase().catch(() => undefined);
  process.exitCode = 1;
});
