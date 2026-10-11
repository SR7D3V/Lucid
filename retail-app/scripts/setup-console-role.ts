/**
 * Creates (or updates) the restricted login role used by the admin SQL console and grants it
 * read access to the `console` schema only. The role name and password come from
 * SQL_CONSOLE_DATABASE_URL. Run after migrations, as a role with CREATEROLE:
 *
 *   npm run db:console-role
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;
const quoteLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function main() {
  const url = process.env.SQL_CONSOLE_DATABASE_URL;
  if (!url) throw new Error('Set SQL_CONSOLE_DATABASE_URL (e.g. postgres://lucid_console:<password>@host/db).');

  const parsed = new URL(url);
  const role = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!role || !password) throw new Error('SQL_CONSOLE_DATABASE_URL must include a username and password.');
  if (password.length < 16) throw new Error('Use a console password of at least 16 characters.');

  const { pool } = await import('../src/server/db');
  const client = await pool().connect();
  try {
    const db = (await client.query<{ db: string }>('SELECT current_database() AS db')).rows[0].db;
    const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount;
    const r = quoteIdent(role);

    await client.query(
      `${exists ? 'ALTER' : 'CREATE'} ROLE ${r} LOGIN PASSWORD ${quoteLiteral(password)}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5`
    );
    await client.query(`ALTER ROLE ${r} SET default_transaction_read_only = on`);
    await client.query(`ALTER ROLE ${r} SET statement_timeout = '5s'`);
    await client.query(`ALTER ROLE ${r} SET idle_in_transaction_session_timeout = '10s'`);
    await client.query(`ALTER ROLE ${r} SET search_path = console`);

    // Nothing outside the console schema.
    await client.query(`REVOKE ALL ON DATABASE ${quoteIdent(db)} FROM ${r}`);
    await client.query(`GRANT CONNECT ON DATABASE ${quoteIdent(db)} TO ${r}`);
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${r}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`);
    await client.query(`GRANT USAGE ON SCHEMA console TO ${r}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA console TO ${r}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA console GRANT SELECT ON TABLES TO ${r}`);

    console.log(`Console role "${role}" is ready with read-only access to schema "console" in ${db}.`);
  } finally {
    client.release();
    await pool().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
