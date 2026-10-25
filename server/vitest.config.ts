import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Integration tests run against a separate `<db>_test` database derived from DATABASE_URL
// (override with TEST_DATABASE_URL). It is created and migrated in globalSetup.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file
}
const baseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://sipita:sipita@localhost:5432/sipita?schema=public';
const testUrl = new URL(process.env['TEST_DATABASE_URL'] ?? baseUrl);
if (!process.env['TEST_DATABASE_URL']) testUrl.pathname = `${testUrl.pathname}_test`;
process.env['TEST_DATABASE_URL'] = testUrl.toString();

export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  // Tests run in the SSR environment, which has its own resolver conditions.
  ssr: {
    resolve: {
      conditions: ['source'],
      externalConditions: ['source'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/test/globalSetup.ts'],
    // Test files share one database, so run them sequentially.
    fileParallelism: false,
    // API tests run many transactions per case; the default 5–10 s is too tight on a busy machine.
    testTimeout: 30_000,
    // beforeEach truncates every table; give it the same room under load.
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testUrl.toString(),
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_EXPIRES: '15m',
      JWT_REFRESH_EXPIRES: '7d',
      UPLOAD_DIR: path.join(os.tmpdir(), 'sipita-test-uploads'),
      // Small limit keeps the oversized-upload test cheap.
      MAX_UPLOAD_MB: '1',
    },
  },
});
