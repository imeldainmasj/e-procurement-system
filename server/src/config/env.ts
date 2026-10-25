import { z } from 'zod';

// jsonwebtoken / ms duration, e.g. 15m, 7d, 3600s
const duration = z
  .string()
  .regex(/^\d+[smhd]$/, { message: 'Format durasi harus seperti 15m atau 7d' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRES: duration.default('15m'),
  JWT_REFRESH_EXPIRES: duration.default('7d'),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  MAX_IMPORT_MB: z.coerce.number().positive().default(20),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('SIPITA <no-reply@perusahaan.co.id>'),
  TZ: z.string().default('Asia/Jakarta'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast: the app must not boot with an invalid configuration.
    console.error('❌ Konfigurasi environment tidak valid:');
    console.error(z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
