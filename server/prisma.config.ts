import { defineConfig } from 'prisma/config';

// Load server/.env when present (CI/production may inject env vars directly).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the process environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --conditions=source prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
