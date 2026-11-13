// Applies the migrations to disposable databases and verifies the score /
// rarity contract.
//
// Two paths are exercised:
//   1. A fresh database receives every migration in order.
//   2. A legacy database (the shape of the production Neon instance before
//      the reconciliation) receives only 0002 and must reach the same
//      canonical schema.
//
// The target databases are created and dropped by this script.
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

const MIGRATION_DIR = 'src/db/migrations';
const LEGACY_FIXTURE = 'scripts/fixtures/legacy-schema.sql';

async function createDatabase(dbName: string): Promise<void> {
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();
}

async function dropDatabase(dbName: string): Promise<void> {
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
}

function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function applyFile(client: Client, file: string): Promise<void> {
  const statements = splitStatements(readFileSync(file, 'utf8'));
  for (const statement of statements) {
    await client.query(statement);
  }
  console.log(`applied ${file} (${statements.length} statements)`);
}

async function applyAllMigrations(client: Client): Promise<void> {
  const files = readdirSync(MIGRATION_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await applyFile(client, `${MIGRATION_DIR}/${file}`);
  }
}

const REQUIRED_CONSTRAINTS = [
  'articles_kind_valid',
  'articles_status_valid',
  'articles_review_fields_only',
  'articles_review_complete',
  'articles_score_valid',
  'articles_score_details_valid',
  'articles_news_fields_only',
  'articles_game_fk',
  'articles_cover_media_fk',
  'articles_og_media_fk',
  'articles_rarity_fk',
  'games_slug_format',
  'games_status_valid',
  'games_cover_media_fk',
  'media_dimensions_positive',
  'media_rights_require_credit',
  'media_variants_dimensions_positive',
  'media_variants_media_id_media_id_fk',
  'article_revisions_version_positive',
  'article_revisions_article_id_articles_id_fk',
  'sessions_expiry_order',
  'redirects_status_code_valid',
  'storage_orphans_action_valid',
  'storage_orphans_status_valid',
  'score_rarities_range_valid',
];

const REQUIRED_TRIGGERS = [
  'games_set_updated_at',
  'articles_validate_tags',
  'articles_set_updated_at',
  'redirects_validate',
  'articles_set_rarity',
];

const REQUIRED_INDEXES = [
  'articles_kind_slug_active',
  'articles_visible_idx',
  'articles_featured_idx',
  'articles_tags_idx',
  'articles_rarity_idx',
  'articles_game_idx',
  'games_platforms_idx',
  'games_genres_idx',
  'media_variants_media_width_unique',
  'article_revisions_article_version_unique',
  'sessions_expiry_idx',
  'login_attempts_ip_time_idx',
  'redirects_to_path_idx',
  'storage_orphans_pending_idx',
];

async function assertCanonicalSchema(client: Client): Promise<void> {
  const tables = await client.query(
    `select count(*)::int as count from pg_tables where schemaname='public'`
  );
  if (tables.rows[0]?.count !== 11) {
    throw new Error(`expected 11 tables, got ${tables.rows[0]?.count}`);
  }
  console.log(`tables: ${tables.rows[0].count}`);

  for (const name of REQUIRED_CONSTRAINTS) {
    const result = await client.query(
      `select 1 from pg_constraint where conname = $1 and connamespace='public'::regnamespace`,
      [name]
    );
    if (result.rowCount !== 1) throw new Error(`missing constraint ${name}`);
  }
  console.log(`constraints: ${REQUIRED_CONSTRAINTS.length} present`);

  for (const name of REQUIRED_TRIGGERS) {
    const result = await client.query(
      `select 1 from pg_trigger where tgname = $1 and not tgisinternal`,
      [name]
    );
    if (result.rowCount !== 1) throw new Error(`missing trigger ${name}`);
  }
  console.log(`triggers: ${REQUIRED_TRIGGERS.length} present`);

  for (const name of REQUIRED_INDEXES) {
    const result = await client.query(`select 1 from pg_indexes where indexname = $1`, [name]);
    if (result.rowCount !== 1) throw new Error(`missing index ${name}`);
  }
  console.log(`indexes: ${REQUIRED_INDEXES.length} present`);

  const rarities = await client.query('select count(*)::int as count from score_rarities');
  if (rarities.rows[0]?.count !== 6) {
    throw new Error(`expected 6 rarities, got ${rarities.rows[0]?.count}`);
  }
  console.log(`rarities: ${rarities.rows[0].count}`);
}

/** Verifies the score and rarity behaviour against a migrated database. */
async function assertScoreContract(client: Client): Promise<void> {
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

  // Tags keep their limits.
  let tagsFailed = false;
  try {
    await client.query(
      `insert into articles (kind, slug, title, body, tags, status) values ('news', 'too-many-tags', 'Test', 'Cuerpo', $1::text[], 'draft')`,
      [Array.from({ length: 6 }, (_, index) => `tag-${index}`)]
    );
  } catch {
    tagsFailed = true;
  }
  if (!tagsFailed) throw new Error('six tags should have been rejected');
  console.log('tag limits: ok');
}

async function runPhase(dbName: string, prepare: (client: Client) => Promise<void>): Promise<void> {
  await createDatabase(dbName);
  const dbUrl = new URL(url.toString());
  dbUrl.pathname = `/${dbName}`;
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    await prepare(client);
    await assertCanonicalSchema(client);
    await assertScoreContract(client);
  } finally {
    await client.end();
    await dropDatabase(dbName);
  }
}

async function main(): Promise<void> {
  console.log('phase 1: fresh database receives every migration');
  await runPhase('netti_migration_check', async (client) => {
    await applyAllMigrations(client);
  });

  console.log('phase 2: legacy database is reconciled by 0002');
  await runPhase('netti_legacy_check', async (client) => {
    await applyFile(client, LEGACY_FIXTURE);
    await client.query('SET search_path TO public');
    const legacyTables = await client.query(
      `select count(*)::int as count from pg_tables where schemaname='public'`
    );
    console.log(`legacy tables: ${legacyTables.rows[0].count}`);

    // A legacy database without the version trigger stored several snapshots
    // for the same version; the reconciliation keeps the newest one.
    await client.query(
      `insert into articles (kind, slug, title, body, status, published_at)
       values ('news', 'legacy-article', 'Legacy', 'Cuerpo del artículo legacy.', 'published', now())`
    );
    await client.query(
      `insert into article_revisions (article_id, version, snapshot, created_at)
       values (1, 1, '{"state":"draft"}', now() - interval '2 minutes'),
              (1, 1, '{"state":"published"}', now() - interval '1 minute')`
    );
    const duplicates = await client.query(
      `select count(*)::int as count from article_revisions where article_id = 1 and version = 1`
    );
    if (duplicates.rows[0]?.count !== 2) {
      throw new Error('the legacy duplicate revisions were not created');
    }

    await applyFile(client, `${MIGRATION_DIR}/0002_reconcile_legacy_schema.sql`);

    const remaining = await client.query(
      `select count(*)::int as count from article_revisions where article_id = 1 and version = 1`
    );
    if (remaining.rows[0]?.count !== 1) {
      throw new Error(`expected one revision after the cleanup, got ${remaining.rows[0]?.count}`);
    }
    const kept = await client.query(
      `select snapshot from article_revisions where article_id = 1 and version = 1`
    );
    if (!String(kept.rows[0]?.snapshot).includes('published')) {
      throw new Error('the cleanup must keep the newest snapshot');
    }
    console.log('legacy duplicate revisions: cleaned');
  });

  console.log('migration check finished');
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await dropDatabase('netti_migration_check').catch(() => undefined);
  await dropDatabase('netti_legacy_check').catch(() => undefined);
  process.exitCode = 1;
});
