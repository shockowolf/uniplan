import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

process.env.DATABASE_URL ??= 'postgresql://uniplan:uniplan_password@127.0.0.1:5433/uniplan_dev?schema=uniplan_test_u10';
process.env.UNIPLAN_DEMO_AUTH_ENABLED = 'false';
process.env.UNIPLAN_APP_ORIGIN = 'http://localhost';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
