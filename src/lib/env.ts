import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  DATABASE_URL_UNPOOLED: z
    .string()
    .min(1, "DATABASE_URL_UNPOOLED es requerida"),
  ADMIN_PASSWORD_HASH: z.string().min(1, "ADMIN_PASSWORD_HASH es requerida"),
  BLOB_READ_WRITE_TOKEN: z
    .string()
    .min(1, "BLOB_READ_WRITE_TOKEN es requerida"),
  VERCEL_OIDC_TOKEN: z.string().optional(),
  BLOB_STORE_ID: z.string().optional(),
  CRON_SECRET: z.string().min(1, "CRON_SECRET es requerida"),
  EDGE_CONFIG_ID: z.string().optional(),
  IMAGES_PUBLIC_BASE_URL: z.string().url().optional(),
  PUBLIC_SITE_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);

export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";
