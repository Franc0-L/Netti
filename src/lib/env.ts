import { z } from 'zod';

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
    DATABASE_URL_UNPOOLED: z.string().min(1, 'DATABASE_URL_UNPOOLED es requerida'),
    ADMIN_PASSWORD_HASH: z.string().min(1, 'ADMIN_PASSWORD_HASH es requerida'),
    BLOB_READ_WRITE_TOKEN: z.string().min(1, 'BLOB_READ_WRITE_TOKEN es requerida'),
    VERCEL_OIDC_TOKEN: z.string().optional(),
    BLOB_STORE_ID: z.string().optional(),
    CRON_SECRET: z.string().min(32, 'CRON_SECRET debe tener al menos 32 caracteres'),
    IP_HASH_SECRET: z
      .string()
      .min(32, 'IP_HASH_SECRET debe tener al menos 32 caracteres')
      .optional(),
    EDGE_CONFIG_ID: z.string().optional(),
    IMAGES_PUBLIC_BASE_URL: z.string().url().optional(),
    PUBLIC_SITE_URL: z.string().url().optional(),
  })
  .superRefine((values, ctx) => {
    if (process.env.NODE_ENV === 'production' && !values.PUBLIC_SITE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_SITE_URL'],
        message: 'PUBLIC_SITE_URL es obligatoria en producción.',
      });
    }
  });

export const env = envSchema.parse(process.env);

export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';
