import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL no está definida');
}

const configuredPoolMax = Number(process.env.DATABASE_POOL_MAX ?? 2);

if (!Number.isInteger(configuredPoolMax) || configuredPoolMax < 1 || configuredPoolMax > 10) {
  throw new Error('DATABASE_POOL_MAX debe ser un entero entre 1 y 10');
}

// Each serverless instance owns its own pool. Keep the default deliberately small.
export const pool = new Pool({
  connectionString,
  max: configuredPoolMax,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

// Vercel Fluid compute can release idle connections between invocations.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });

export type DB = typeof db;
/** Transaction handle used by the server actions. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
