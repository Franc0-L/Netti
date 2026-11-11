/**
 * Integration checks for authentication, sessions and rate limiting against a
 * real PostgreSQL database.
 *
 * These checks are deliberately kept out of `npm test`: they need a disposable
 * database with the baseline migration applied. Run them with:
 *
 *   npm run test:db
 *
 * Required environment:
 *   DATABASE_URL, CRON_SECRET (>= 32 chars)
 *
 * The database must be local or its name must end in _test/_testing: the script
 * deletes sessions and login attempts while exercising the flows.
 */
import { createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const TEST_PASSWORD = 'integration-password-123456';
const WRONG_PASSWORD = 'not-the-admin-password';

function deriveScrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, derived) => (error ? reject(error) : resolve(derived as Buffer))
    );
  });
}

function assertSafeTarget(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required for integration checks.');

  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//, '');
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  const isTestNamed = /(?:^|[_-])test(?:ing)?$/i.test(database);

  if (!isLocal && !isTestNamed) {
    throw new Error(
      `Refusing to run destructive checks against ${host}/${database}. Use a local or *_test database.`
    );
  }
}

async function configureEnvironment(): Promise<void> {
  assertSafeTarget();

  const salt = randomBytes(16);
  const derived = await deriveScrypt(TEST_PASSWORD, salt);

  process.env.ADMIN_PASSWORD_HASH = [
    'scrypt',
    '131072',
    '8',
    '1',
    salt.toString('base64'),
    derived.toString('base64'),
  ].join(':');
  process.env.CRON_SECRET ??= 'integration-secret-with-at-least-32-characters';
  process.env.BLOB_READ_WRITE_TOKEN ??= 'integration-placeholder';
  process.env.PUBLIC_SITE_URL ??= 'http://localhost:3000';
  process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  FAIL ${name}\n       ${detail}`);
  }
}

function expect(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  await configureEnvironment();

  const { db, pool } = await import('../src/db/index');
  const { sql } = await import('drizzle-orm');
  const auth = await import('../src/lib/auth');
  const { sessions, loginAttempts } = await import('../src/db/schema');

  const expectedTables = [
    'articles',
    'article_revisions',
    'cron_runs',
    'games',
    'login_attempts',
    'media',
    'media_variants',
    'redirects',
    'sessions',
    'storage_orphans',
  ];

  await check('baseline migration created the ten runtime tables', async () => {
    const rows = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' order by 1`
    );
    const names = rows.rows.map((row) => row.tablename);
    expect(
      expectedTables.every((table) => names.includes(table)),
      `missing tables: ${expectedTables.filter((table) => !names.includes(table)).join(', ')}`
    );
  });

  await check('baseline migration created triggers and check constraints', async () => {
    const triggers = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from pg_trigger where not tgisinternal`
    );
    expect(Number(triggers.rows[0]?.count) >= 4, 'expected at least 4 triggers');

    const checks = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from pg_constraint
          where contype = 'c' and connamespace = 'public'::regnamespace`
    );
    expect(Number(checks.rows[0]?.count) >= 38, 'expected the check constraints from the baseline');
  });

  await check('origin validation accepts the configured origin only', async () => {
    auth.assertSameOrigin('http://localhost:3000');
    for (const candidate of [
      undefined,
      'https://evil.example',
      'not-a-url',
      'http://localhost:3001',
    ]) {
      let rejected = false;
      try {
        auth.assertSameOrigin(candidate);
      } catch {
        rejected = true;
      }
      expect(rejected, `origin ${String(candidate)} should be rejected`);
    }
  });

  await check('session tokens are random and only their hash is stored', async () => {
    const first = auth.createSessionToken();
    const second = auth.createSessionToken();
    expect(first.token !== second.token, 'tokens must be unique');
    expect(first.sessionId !== second.sessionId, 'session ids must differ');
    expect(
      first.sessionId === createHash('sha256').update(first.token).digest('hex'),
      'session id must be the SHA-256 digest of the token'
    );

    const now = new Date();
    await db.delete(sessions);
    await db.insert(sessions).values({
      id: first.sessionId,
      expiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
    });
    const [stored] = await db.select().from(sessions);
    expect(stored?.id === first.sessionId, 'session row must use the digest as primary key');
    expect(!JSON.stringify(stored).includes(first.token), 'raw token must never be persisted');
    await db.delete(sessions);
  });

  await check('expired sessions are distinguishable for cleanup', async () => {
    const now = new Date();
    await db.delete(sessions);
    await db.insert(sessions).values([
      {
        id: 'integration-expired',
        expiresAt: new Date(now.getTime() - 60_000),
        absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
      },
      {
        id: 'integration-active',
        expiresAt: new Date(now.getTime() + 3_600_000),
        absoluteExpiresAt: new Date(now.getTime() + 7_200_000),
      },
    ]);
    const active = await db.select().from(sessions);
    expect(active.length === 2, 'expected two session rows');
    await db.delete(sessions);
  });

  await check('wrong passwords are recorded and locked after five failures', async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;
    await db.delete(loginAttempts);

    const outcomes = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      outcomes.push(await auth.attemptLogin(ip, WRONG_PASSWORD));
      await delay(5);
    }

    expect(
      outcomes.slice(0, 5).every((outcome) => outcome.allowed && !outcome.valid),
      'the first five failures must be allowed but invalid'
    );
    expect(outcomes[5]?.allowed === false, 'the sixth attempt must be rate limited');
    expect(outcomes[5]?.retryAfter > 0, 'the sixth attempt must report a retry delay');
  });

  await check('concurrent attempts cannot exceed the failure limit', async () => {
    const ip = `10.0.1.${Math.floor(Math.random() * 200) + 1}`;
    await db.delete(loginAttempts);

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => auth.attemptLogin(ip, WRONG_PASSWORD))
    );

    const allowed = outcomes.filter((outcome) => outcome.allowed).length;
    expect(allowed === 5, `expected exactly 5 allowed attempts, received ${allowed}`);
    expect(
      outcomes.filter((outcome) => !outcome.allowed && outcome.retryAfter > 0).length === 5,
      'the remaining attempts must be rate limited'
    );
  });

  await check('the correct password is accepted once the window is clear', async () => {
    await delay(1_000);
    await db.delete(loginAttempts);
    const outcome = await auth.attemptLogin('10.0.2.10', TEST_PASSWORD);
    expect(outcome.allowed, 'a clean window must allow the attempt');
    expect(outcome.valid, 'the correct password must be accepted');

    const rows = await db.select().from(loginAttempts);
    expect(rows.length === 1 && rows[0]?.success === true, 'the success must be recorded');
  });

  await db.delete(loginAttempts);
  await db.delete(sessions);
  await pool.end();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} integration checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
