/**
 * HTTP smoke test for the running application.
 *
 * It verifies the runtime behaviour that unit tests cannot cover: session
 * cookies against Route Handlers, origin (CSRF) checks, request body limits and
 * the cron endpoints. PostgreSQL must be reachable and migrated.
 *
 * Start the app first, then run:
 *
 *   npm run test:http
 *
 * Environment:
 *   SMOKE_BASE_URL  (default http://127.0.0.1:3000)
 *   DATABASE_URL    (must point to a local PostgreSQL instance)
 *   CRON_SECRET     (must match the running server)
 */
import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function expect(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

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

type Response = { status: number; body: Record<string, unknown> };

function toArrayBuffer(value: Buffer): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Some responses (redirects) have no JSON body.
  }
  return { status: response.status, body };
}

function bearer(): Record<string, string> {
  return { authorization: `Bearer ${CRON_SECRET}` };
}

function multipart(boundary: string, bytes: Uint8Array): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="probe.webp"\r\n` +
      `Content-Type: image/webp\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, Buffer.from(bytes), tail]);
}

/** Sends a chunked body without a Content-Length header. */
function oversizedUpload(boundary: string): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(64 * 1024).fill(0x41);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.webp"\r\n` +
      `Content-Type: image/webp\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  let sent = 0;
  let stage: 'head' | 'chunks' | 'tail' | 'done' = 'head';
  return new ReadableStream({
    pull(controller) {
      if (stage === 'head') {
        controller.enqueue(new Uint8Array(head));
        stage = 'chunks';
        return;
      }
      if (stage === 'chunks' && sent < 56) {
        // 56 * 64 KiB = 3.5 MiB, above the 2 MiB + 128 KiB ceiling.
        controller.enqueue(chunk);
        sent += 1;
        return;
      }
      if (stage !== 'tail') stage = 'tail';
      controller.enqueue(new Uint8Array(tail));
      stage = 'done';
      controller.close();
    },
  });
}

function assertSafeTarget(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required for HTTP smoke tests.');
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//, '');
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (!isLocal) {
    throw new Error(
      `Refusing to run HTTP smoke tests against ${host}/${database}. ` +
        'Only a local PostgreSQL instance (localhost, 127.0.0.1 or ::1) is allowed; ' +
        'a database name ending in _test is not enough.'
    );
  }
}

async function main(): Promise<void> {
  assertSafeTarget();
  expect(CRON_SECRET.length >= 32, 'CRON_SECRET must be at least 32 characters');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const token = randomBytes(32).toString('base64url');
  const sessionId = createHash('sha256').update(token).digest('hex');
  const expiredSessionId = createHash('sha256').update(`expired-${token}`).digest('hex');
  const staleAttemptHash = `smoke-old-attempt-${Date.now()}`;
  const now = Date.now();
  await client.query(
    `insert into sessions (id, expires_at, absolute_expires_at) values ($1, $2, $3)`,
    [sessionId, new Date(now + 3_600_000), new Date(now + 7_200_000)]
  );
  const cookie = { cookie: `session=${token}` };
  const origin = { origin: BASE_URL };

  await check('GET /api/health reports liveness', async () => {
    const response = await call('/api/health');
    expect(response.status === 200, `expected 200, received ${response.status}`);
    expect(response.body.status === 'ok', 'health status must be ok');
  });

  await check('GET /api/ready requires the cron secret', async () => {
    const unauthorized = await call('/api/ready');
    expect(unauthorized.status === 401, `expected 401, received ${unauthorized.status}`);
  });

  await check('GET /api/ready verifies PostgreSQL', async () => {
    const response = await call('/api/ready', { headers: bearer() });
    // Blob may be unavailable in CI (placeholder token), so only PostgreSQL is
    // asserted here; 503 is expected when the Blob dependency fails.
    expect(
      [200, 503].includes(response.status),
      `expected 200 or 503, received ${response.status}`
    );
    const dependencies = response.body.dependencies as Record<string, string> | undefined;
    expect(dependencies?.database === 'ok', `database dependency: ${dependencies?.database}`);
  });

  await check('public pages send a CSP compatible with Next.js inline scripts', async () => {
    const response = await fetch(`${BASE_URL}/`);
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp.includes("script-src 'self' 'unsafe-inline'"), `csp: ${csp}`);
    expect(!csp.includes('nonce-'), 'public pages must not depend on per-request nonces');
    expect(response.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
    expect(response.headers.get('x-frame-options') === 'DENY', 'missing frame protection');
  });

  await check('/admin sends a nonce CSP and Next.js applies it to scripts', async () => {
    const response = await fetch(`${BASE_URL}/admin/login`);
    const csp = response.headers.get('content-security-policy') ?? '';
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce, `admin CSP must include a nonce: ${csp}`);
    expect(csp.includes("'strict-dynamic'"), 'admin CSP must use strict-dynamic');
    const html = await response.text();
    expect(
      html.includes(`nonce="${nonce}"`),
      'the nonce from the response header must appear on rendered script tags'
    );
  });

  await check('unknown routes answer 404 with the error page', async () => {
    const response = await fetch(`${BASE_URL}/no-existe`, { redirect: 'manual' });
    expect(response.status === 404, `expected 404, received ${response.status}`);
    const html = await response.text();
    expect(html.includes('Esta página no existe'), 'the 404 page must render its message');
    expect(html.includes('id="contenido"'), 'the 404 page must expose the main landmark');
  });

  await check('unknown collections answer 404', async () => {
    const response = await fetch(`${BASE_URL}/coleccion-inexistente`, { redirect: 'manual' });
    expect(response.status === 404, `expected 404, received ${response.status}`);
  });

  await check('public pages expose language, title and viewport metadata', async () => {
    const html = await (await fetch(`${BASE_URL}/`)).text();
    expect(html.includes('<html lang="es"'), 'the document language must be declared');
    expect(/<title>[^<]+<\/title>/.test(html), 'the document must have a title');
    expect(html.includes('name="viewport"'), 'the viewport meta tag must be present');
    expect(html.includes('rel="canonical"'), 'the canonical link must be present');
  });

  await check('public pages expose a skip link before the navigation', async () => {
    const html = await (await fetch(`${BASE_URL}/`)).text();
    const skipIndex = html.indexOf('class="skip-link"');
    const navIndex = html.indexOf('aria-label="Navegación principal"');
    expect(skipIndex >= 0, 'the skip link must be rendered');
    expect(navIndex >= 0, 'the main navigation must be rendered');
    expect(skipIndex < navIndex, 'the skip link must come before the navigation');
    expect(html.includes('href="#contenido"'), 'the skip link must target the main content');
  });

  await check('public pages have a single h1 and labelled images', async () => {
    for (const path of ['/', '/resenas']) {
      const html = await (await fetch(`${BASE_URL}${path}`)).text();
      const headings = html.match(/<h1[\s>]/g) ?? [];
      expect(headings.length === 1, `${path} must have exactly one h1, found ${headings.length}`);
      const images = html.match(/<img[^>]*>/g) ?? [];
      for (const image of images) {
        expect(/\salt="/.test(image), `${path} has an image without alt: ${image}`);
      }
    }
  });

  await check('robots.txt keeps the admin and API out of the index', async () => {
    const response = await fetch(`${BASE_URL}/robots.txt`);
    expect(response.status === 200, `expected 200, received ${response.status}`);
    const body = await response.text();
    expect(body.includes('/admin'), 'robots.txt must disallow /admin');
    expect(body.includes('/api/'), 'robots.txt must disallow /api/');
  });

  await check('sitemap.xml is served as XML', async () => {
    const response = await fetch(`${BASE_URL}/sitemap.xml`);
    expect(response.status === 200, `expected 200, received ${response.status}`);
    expect(
      (response.headers.get('content-type') ?? '').includes('xml'),
      `unexpected content-type: ${response.headers.get('content-type')}`
    );
    const body = await response.text();
    expect(body.includes('<urlset'), 'the sitemap must contain a urlset');
  });

  await check('GET /admin redirects anonymous visitors to the login page', async () => {
    const response = await fetch(`${BASE_URL}/admin`, { redirect: 'manual' });
    expect(
      [302, 303, 307, 308].includes(response.status),
      `expected a redirect, received ${response.status}`
    );
    expect(
      (response.headers.get('location') ?? '').includes('/admin/login'),
      'the redirect must point to the login page'
    );
  });

  await check('GET /admin renders the panel for a valid session', async () => {
    const response = await fetch(`${BASE_URL}/admin`, { headers: cookie, redirect: 'manual' });
    expect(response.status === 200, `expected 200, received ${response.status}`);
    const html = await response.text();
    expect(html.includes('id="contenido"'), 'the panel must expose the main landmark');
    expect(html.includes('class="skip-link"'), 'the panel must expose a skip link');
  });

  await check('GET /api/metrics rejects requests without a session', async () => {
    const response = await call('/api/metrics');
    expect(response.status === 401, `expected 401, received ${response.status}`);
  });

  await check('GET /api/metrics rejects a forged session cookie', async () => {
    const response = await call('/api/metrics', { headers: { cookie: 'session=forged' } });
    expect(response.status === 401, `expected 401, received ${response.status}`);
  });

  await check('GET /api/metrics accepts a valid session', async () => {
    const response = await call('/api/metrics', { headers: cookie });
    expect(response.status === 200, `expected 200, received ${response.status}`);
    expect(response.body.ok === true, 'metrics must report ok');
  });

  await check('GET /api/cron/cleanup rejects missing or wrong credentials', async () => {
    const missing = await call('/api/cron/cleanup');
    expect(missing.status === 401, `expected 401, received ${missing.status}`);
    const wrong = await call('/api/cron/cleanup', {
      headers: { authorization: `Bearer ${'x'.repeat(40)}` },
    });
    expect(wrong.status === 401, `expected 401, received ${wrong.status}`);
  });

  await check('GET /api/cron/cleanup purges expired sessions and stale attempts', async () => {
    await client.query(
      `insert into sessions (id, expires_at, absolute_expires_at) values ($1, $2, $3)`,
      [expiredSessionId, new Date(now - 60_000), new Date(now + 60_000)]
    );
    await client.query(
      `insert into login_attempts (ip_hash, success, attempted_at) values ($1, false, $2)`,
      [staleAttemptHash, new Date(now - 10 * 86_400_000)]
    );

    const response = await call('/api/cron/cleanup', { headers: bearer() });
    expect(response.status === 200, `expected 200, received ${response.status}`);
    expect(
      Number(response.body.removedExpiredSessions) >= 1,
      `removedExpiredSessions=${response.body.removedExpiredSessions}`
    );
    expect(
      Number(response.body.removedLoginAttempts) >= 1,
      `removedLoginAttempts=${response.body.removedLoginAttempts}`
    );

    const stale = await client.query(`select count(*)::int as total from sessions where id = $1`, [
      expiredSessionId,
    ]);
    expect(stale.rows[0].total === 0, 'expired session must be deleted');
  });

  await check('POST /api/revalidate rejects missing credentials', async () => {
    const response = await call('/api/revalidate', { method: 'POST' });
    expect(response.status === 401, `expected 401, received ${response.status}`);
  });

  await check('POST /api/revalidate activates due scheduled publications', async () => {
    const slug = `smoke-scheduled-${Date.now()}`;
    await client.query(
      `insert into articles (kind, slug, title, description, body, status, published_at)
       values ('news', $1, 'Smoke scheduled article', 'Smoke test', 'Body for the smoke test.', 'published', $2)`,
      [slug, new Date(now - 60_000)]
    );

    const response = await call('/api/revalidate', { method: 'POST', headers: bearer() });
    expect(response.status === 200, `expected 200, received ${response.status}`);
    expect(Number(response.body.revalidated) >= 1, `revalidated=${response.body.revalidated}`);

    await client.query('delete from articles where slug = $1', [slug]);
  });

  await check('POST /api/upload rejects a foreign origin', async () => {
    const response = await call('/api/upload', {
      method: 'POST',
      headers: { ...cookie, origin: 'https://evil.example' },
      body: 'x',
    });
    expect(response.status === 403, `expected 403, received ${response.status}`);
  });

  await check('POST /api/upload requires a session', async () => {
    const response = await call('/api/upload', { method: 'POST', headers: origin, body: 'x' });
    expect(response.status === 401, `expected 401, received ${response.status}`);
  });

  await check('POST /api/upload enforces the body limit without Content-Length', async () => {
    const boundary = `----smoke${randomBytes(4).toString('hex')}`;
    const response = await call('/api/upload', {
      method: 'POST',
      headers: {
        ...cookie,
        ...origin,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: oversizedUpload(boundary),
      // Required by Node's fetch to stream a request body.
      duplex: 'half',
    } as RequestInit);
    expect(response.status === 413, `expected 413, received ${response.status}`);
  });

  await check('POST /api/upload rejects a non-image payload', async () => {
    const boundary = `----smoke${randomBytes(4).toString('hex')}`;
    const body = multipart(boundary, new Uint8Array(64).fill(0x41));
    const response = await call('/api/upload', {
      method: 'POST',
      headers: {
        ...cookie,
        ...origin,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: toArrayBuffer(body),
    });
    expect(
      response.status === 415 || response.status === 422,
      `expected 415/422, received ${response.status}`
    );
  });

  await client.query('delete from sessions where id = any($1::text[])', [
    [sessionId, expiredSessionId],
  ]);
  await client.query('delete from login_attempts where ip_hash = $1', [staleAttemptHash]);
  await client.query("delete from cron_runs where job_name in ('cleanup', 'revalidate_scheduled')");
  await client.end();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} HTTP checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
