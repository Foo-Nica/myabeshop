import { execSync } from 'node:child_process';

/**
 * Applies pending migrations to the dedicated test database and upserts the plans.
 * Non-destructive: every test creates its own stores and phone numbers, so runs never collide.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://myabe:myabe@localhost:5432/myabeshop_test';
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx ts-node --transpile-only prisma/seed.ts', { env, stdio: 'pipe' });
}
