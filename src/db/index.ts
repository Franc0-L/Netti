import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida");
}

export const pool = new Pool({
  connectionString,
  max: 3,
});

export const db = drizzle(pool, { schema });

export type DB = typeof db;
