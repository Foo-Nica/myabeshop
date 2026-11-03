import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://myabe:myabe@localhost:5432/myabeshop_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      OTP_DEV_ECHO: 'true',
      WEB_URL: 'http://localhost:3000',
      ROOT_DOMAIN: 'myabeshop.test',
      UPLOAD_DIR: '/tmp/myabeshop-test-uploads',
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
