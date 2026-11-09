import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida");
}

// Keep the pool deliberately small: each serverless instance owns its own pool.
export const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX ?? 2),
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
});

// Vercel Fluid compute can release idle connections between invocations.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });

export type DB = typeof db;
