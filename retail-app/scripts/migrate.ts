/**
 * Applies pending SQL migrations from db/migrations in filename order, each in its own
 * transaction. An advisory lock makes concurrent runs (e.g. several deploys) safe.
 *
 *   npm run db:migrate            apply pending migrations
 *   npm run db:reset              drop everything and re-apply (refuses in production)
 */
import { loadEnvConfig } from '@next/env';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

loadEnvConfig(process.cwd());

async function main() {
  const { pool } = await import('../src/server/db');
  const reset = process.argv.includes('--reset');
  const client = await pool().connect();

  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('lucid:migrations'))`);

    if (reset) {
      if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
      console.log('Resetting schemas "public" and "console"...');
      await client.query('DROP SCHEMA IF EXISTS console CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const applied = new Set(
      (await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((row) => row.version)
    );

    const dir = path.join(process.cwd(), 'db', 'migrations');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
    let count = 0;

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
      console.log(`  applied ${file}`);
      count++;
    }

    console.log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtext('lucid:migrations'))`).catch(() => undefined);
    client.release();
    await pool().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
