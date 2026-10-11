import { loadEnvConfig } from '@next/env';
import { afterAll } from 'vitest';

loadEnvConfig(process.cwd());

afterAll(async () => {
  const { pool } = await import('@/server/db');
  await pool().end();
});
