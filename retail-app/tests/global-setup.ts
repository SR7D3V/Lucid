import { loadEnvConfig } from '@next/env';
import { execFileSync } from 'child_process';

/**
 * Rebuilds the test database from migrations once per run. Env comes from .env.test.local
 * (Next's test-mode env files); the database name must end in "_test" because its schema is dropped.
 */
export default function setup() {
  loadEnvConfig(process.cwd());
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL in .env.test.local to a disposable *_test database.');
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${new URL(url).pathname.slice(1)}": the database name must end in _test.`);
  }

  execFileSync('npx', ['tsx', 'scripts/migrate.ts', '--reset'], { env: process.env, stdio: 'inherit' });
  if (process.env.SQL_CONSOLE_DATABASE_URL) {
    execFileSync('npx', ['tsx', 'scripts/setup-console-role.ts'], { env: process.env, stdio: 'inherit' });
  }
}
