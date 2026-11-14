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
 * The database must be local (localhost, 127.0.0.1 or ::1). The script only
 * inserts and deletes its own fixtures, but a local disposable database is
 * still required because the migration must be applied.
 */
import { createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { assertLocalDatabaseUrl, loadEnvFiles } from './load-env.js';

loadEnvFiles(['.env']);

const TEST_PASSWORD = 'integration-password-123456';
const WRONG_PASSWORD = 'not-the-admin-password';
const RUN_ID = randomBytes(6).toString('hex');

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

  const url = assertLocalDatabaseUrl(raw);
  const database = url.pathname.replace(/^\//, '');

  if (!database.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run integration checks against ${url.hostname}/${database}. ` +
        'The database name must contain "test": the checks write and purge data.'
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
  const { and, arrayContains, arrayOverlaps, eq, inArray, like, sql } = await import('drizzle-orm');
  const auth = await import('../src/lib/auth');
  const { articles, games, loginAttempts, sessions } = await import('../src/db/schema');

  const attemptIps = new Set<string>();
  const uniqueIp = (label: string): string => {
    const ip = `integration-${RUN_ID}-${label}`;
    attemptIps.add(ip);
    return ip;
  };
  const clearOwnAttempts = async (): Promise<void> => {
    const hashes = Array.from(attemptIps, (ip) => auth.hashIp(ip));
    if (hashes.length === 0) return;
    await db.delete(loginAttempts).where(inArray(loginAttempts.ipHash, hashes));
  };

  const expectedTables = [
    'articles',
    'article_gallery',
    'article_revisions',
    'cron_runs',
    'games',
    'login_attempts',
    'media',
    'media_variants',
    'redirects',
    'score_rarities',
    'sessions',
    'storage_orphans',
  ];

  await check('baseline migration created the twelve runtime tables', async () => {
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
    expect(Number(triggers.rows[0]?.count) >= 5, 'expected at least 5 triggers');

    const checks = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from pg_constraint
          where contype = 'c' and connamespace = 'public'::regnamespace`
    );
    expect(Number(checks.rows[0]?.count) >= 43, 'expected the check constraints from the baseline');
  });

  await check('the rarity band is derived from the score', async () => {
    const slug = `integration-rarity-${RUN_ID}`;
    const bands: Array<[number, string]> = [
      [0, 'common'],
      [19, 'common'],
      [20, 'uncommon'],
      [40, 'rare'],
      [60, 'epic'],
      [80, 'legendary'],
      [90, 'mythic'],
      [100, 'mythic'],
    ];
    try {
      for (const [score, expected] of bands) {
        const [row] = await db
          .insert(articles)
          .values({
            kind: 'review',
            slug: `${slug}-${score}`,
            title: 'Prueba de rareza',
            body: 'Cuerpo de prueba para la rareza derivada.',
            score,
            status: 'draft',
          })
          .returning({ rarityKey: articles.rarityKey });
        expect(row?.rarityKey === expected, `score ${score} should be ${expected}`);
      }
    } finally {
      await db.delete(articles).where(like(articles.slug, `${slug}%`));
    }
  });

  await check('the database validates the editorial breakdown', async () => {
    const slug = `integration-details-${RUN_ID}`;
    try {
      const [stored] = await db
        .insert(articles)
        .values({
          kind: 'review',
          slug: `${slug}-ok`,
          title: 'Prueba de subpuntuaciones',
          body: 'Cuerpo de prueba para las subpuntuaciones.',
          score: 80,
          scoreDetails: { story: 8, gameplay: 9, visual: 7 },
          status: 'draft',
        })
        .returning({ id: articles.id });
      expect(stored?.id !== undefined, 'valid sub-scores must be stored');

      let rejected = false;
      try {
        await db.insert(articles).values({
          kind: 'review',
          slug: `${slug}-bad`,
          title: 'Prueba de subpuntuaciones',
          body: 'Cuerpo de prueba para las subpuntuaciones.',
          score: 80,
          scoreDetails: { story: 42 },
          status: 'draft',
        });
      } catch {
        rejected = true;
      }
      expect(rejected, 'a sub-score outside 1-10 must be rejected');

      let outOfRange = false;
      try {
        await db.insert(articles).values({
          kind: 'review',
          slug: `${slug}-range`,
          title: 'Prueba de subpuntuaciones',
          body: 'Cuerpo de prueba para las subpuntuaciones.',
          score: 101,
          status: 'draft',
        });
      } catch {
        outOfRange = true;
      }
      expect(outOfRange, 'a score outside 0-100 must be rejected');
    } finally {
      await db.delete(articles).where(like(articles.slug, `${slug}%`));
    }
  });

  await check('the game catalog filters and trash rules work', async () => {
    const slug = `integration-game-${RUN_ID}`;
    try {
      const [game] = await db
        .insert(games)
        .values({
          slug,
          title: 'Juego de prueba',
          description: '',
          status: 'published',
          coverImageUrl: 'https://example.com/cover.webp',
          coverAlt: 'Portada de prueba',
          platforms: ['PC', 'PlayStation 5'],
          genres: ['RPG'],
          tags: ['indie', 'narrativo'],
          releaseDate: new Date('2024-05-01T00:00:00.000Z'),
        })
        .returning({ id: games.id });
      expect(game?.id !== undefined, 'a published game with a cover must be stored');

      const matching = await db
        .select({ id: games.id })
        .from(games)
        .where(and(eq(games.id, game.id), arrayContains(games.platforms, ['PC'])));
      expect(matching.length === 1, 'the platform filter must match');

      const missing = await db
        .select({ id: games.id })
        .from(games)
        .where(and(eq(games.id, game.id), arrayContains(games.platforms, ['Switch'])));
      expect(missing.length === 0, 'a platform that is not present must not match');

      const [tagged] = await db
        .insert(articles)
        .values({
          kind: 'news',
          slug: `${slug}-tags`,
          title: 'Noticia de prueba',
          body: 'Cuerpo de prueba para las etiquetas.',
          tags: ['indie'],
          status: 'draft',
        })
        .returning({ id: articles.id });
      const overlapping = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, tagged.id), arrayOverlaps(articles.tags, ['indie'])));
      expect(overlapping.length === 1, 'the related-articles tag overlap must match');

      await db
        .update(games)
        .set({ status: 'trashed', previousStatus: 'published', trashedAt: new Date() })
        .where(eq(games.id, game.id));

      let rejected = false;
      try {
        await db.update(games).set({ trashedAt: null }).where(eq(games.id, game.id));
      } catch {
        rejected = true;
      }
      expect(rejected, 'a trashed game without a date must be rejected');
    } finally {
      await db.delete(games).where(like(games.slug, `${slug}%`));
      await db.delete(articles).where(like(articles.slug, `${slug}%`));
    }
  });

  await check('origin validation accepts the configured origin only', async () => {
    const configured = process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000';
    auth.assertSameOrigin(configured);

    const parsed = new URL(configured);
    const otherPort = parsed.port === '3001' ? '3002' : '3001';
    const otherOrigin = new URL(parsed.toString());
    otherOrigin.port = otherPort;

    for (const candidate of [
      undefined,
      'https://evil.example',
      'not-a-url',
      otherOrigin.toString(),
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
    await db.insert(sessions).values({
      id: first.sessionId,
      expiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
    });
    const [stored] = await db.select().from(sessions).where(eq(sessions.id, first.sessionId));
    expect(stored?.id === first.sessionId, 'session row must use the digest as primary key');
    expect(!JSON.stringify(stored).includes(first.token), 'raw token must never be persisted');
    await db.delete(sessions).where(eq(sessions.id, first.sessionId));
  });

  await check('expired sessions are distinguishable for cleanup', async () => {
    const now = new Date();
    const expiredId = `integration-expired-${RUN_ID}`;
    const activeId = `integration-active-${RUN_ID}`;
    await db.insert(sessions).values([
      {
        id: expiredId,
        expiresAt: new Date(now.getTime() - 60_000),
        absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
      },
      {
        id: activeId,
        expiresAt: new Date(now.getTime() + 3_600_000),
        absoluteExpiresAt: new Date(now.getTime() + 7_200_000),
      },
    ]);
    const active = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.id, [expiredId, activeId]));
    expect(active.length === 2, 'expected two fixture session rows');
    await db.delete(sessions).where(inArray(sessions.id, [expiredId, activeId]));
  });

  await check('wrong passwords are recorded and locked after five failures', async () => {
    const ip = uniqueIp('wrong-password');

    const outcomes = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      outcomes.push(await auth.attemptLogin(ip, WRONG_PASSWORD));
    }

    expect(
      outcomes.slice(0, 5).every((outcome) => outcome.allowed && !outcome.valid),
      'the first five failures must be allowed but invalid'
    );
    expect(outcomes[5]?.allowed === false, 'the sixth attempt must be rate limited');
    expect(outcomes[5]?.retryAfter > 0, 'the sixth attempt must report a retry delay');
  });

  await check('concurrent attempts cannot exceed the failure limit', async () => {
    const ip = uniqueIp('concurrent');

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
    const ip = uniqueIp('correct-password');
    const outcome = await auth.attemptLogin(ip, TEST_PASSWORD);
    expect(outcome.allowed, 'a clean window must allow the attempt');
    expect(outcome.valid, 'the correct password must be accepted');

    const rows = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.ipHash, auth.hashIp(ip)));
    expect(rows.length === 1 && rows[0]?.success === true, 'the success must be recorded');
  });

  await clearOwnAttempts();
  await pool.end();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} integration checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
