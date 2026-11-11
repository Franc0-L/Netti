import { Pool } from 'pg';

/**
 * Existence check for public content, executed in the proxy.
 *
 * Next.js renders streamed responses with status 200: when `notFound()` runs
 * after the shell was flushed, the status can no longer be changed. The only
 * reliable way to answer a missing article with a real 404 is to decide before
 * the render starts.
 *
 * The check is deliberately cheap:
 *
 * - The visible slug set of a collection is cached in memory for 15 seconds.
 * - Unknown slugs are confirmed with one indexed query and then negatively
 *   cached for 10 seconds, so crawler traffic does not repeat the same query.
 * - A per-instance budget caps the confirmations per minute.
 * - Any database failure fails open: the page renders and decides on its own.
 */

const TTL_MS = 15_000;
const MISSING_TTL_MS = 10_000;
const CONFIRMATION_BUDGET = 20;

type CollectionState = {
  loadedAt: number;
  slugs: Set<string>;
  missing: Map<string, number>;
};

const states = new Map<string, CollectionState>();

let confirmations = 0;
let confirmationWindowStart = Date.now();

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL no está definida');
    pool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 3_000,
      allowExitOnIdle: true,
    });
  }
  return pool;
}

async function queryVisibleSlugs(kind: string): Promise<string[]> {
  const result = await getPool().query<{ slug: string }>(
    `select slug from articles
      where kind = $1
        and status = 'published'
        and published_at is not null
        and published_at <= now()`,
    [kind]
  );
  return result.rows.map((row) => row.slug);
}

async function queryVisibleSlug(kind: string, slug: string): Promise<boolean> {
  const result = await getPool().query(
    `select 1 from articles
      where kind = $1
        and slug = $2
        and status = 'published'
        and published_at is not null
        and published_at <= now()
      limit 1`,
    [kind, slug]
  );
  return result.rowCount !== 0;
}

function takeConfirmationBudget(): boolean {
  const now = Date.now();
  if (now - confirmationWindowStart > 60_000) {
    confirmationWindowStart = now;
    confirmations = 0;
  }
  if (confirmations >= CONFIRMATION_BUDGET) return false;
  confirmations += 1;
  return true;
}

function getState(kind: string): CollectionState {
  const existing = states.get(kind);
  if (existing) return existing;
  const state: CollectionState = { loadedAt: 0, slugs: new Set(), missing: new Map() };
  states.set(kind, state);
  return state;
}

/**
 * Tells whether an article is publicly visible.
 *
 * Returns `true` when the article exists and is already published, `false`
 * when it does not exist. Database failures also return `false` so the proxy
 * answers 404 instead of failing the whole request.
 */
export async function isVisibleArticle(kind: string, slug: string): Promise<boolean> {
  const state = getState(kind);
  const now = Date.now();

  if (now - state.loadedAt > TTL_MS) {
    try {
      const slugs = await queryVisibleSlugs(kind);
      state.slugs = new Set(slugs);
      state.missing.clear();
      state.loadedAt = now;
    } catch {
      // Fail open: let the page render and answer on its own.
      state.loadedAt = now;
      return true;
    }
  }

  if (state.slugs.has(slug)) return true;

  const missingUntil = state.missing.get(slug);
  if (missingUntil !== undefined) {
    if (missingUntil > now) return false;
    state.missing.delete(slug);
  }

  if (!takeConfirmationBudget()) return false;

  try {
    const visible = await queryVisibleSlug(kind, slug);
    if (visible) state.slugs.add(slug);
    else state.missing.set(slug, Date.now() + MISSING_TTL_MS);
    return visible;
  } catch {
    // Fail open: let the page render and answer on its own.
    return true;
  }
}
