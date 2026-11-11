import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
