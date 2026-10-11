import { DatabaseError, Pool, type QueryArrayConfig } from 'pg';
import type { Overview, ProductOption, SchemaTable, SqlResult } from '@/lib/types';
import { badRequest, serviceUnavailable } from '../errors';
import { env } from '../env';
import { exec, many, one } from '../db';

export async function getOverview() {
  return (await one<Overview>(
    `SELECT
       (SELECT coalesce(sum(total_amount), 0) FROM orders WHERE status <> 'cancelled') AS revenue,
       (SELECT count(*)::integer FROM orders) AS orders,
       (SELECT count(*)::integer FROM orders WHERE status = 'confirmed') AS "openOrders",
       (SELECT count(*)::integer FROM customers WHERE role = 'customer') AS customers,
       (SELECT count(*)::integer FROM products WHERE is_active) AS products,
       (SELECT count(*)::integer FROM inventory i JOIN products p ON p.product_id = i.product_id
          WHERE p.is_active AND i.quantity < 10) AS "lowStock"`
  ))!;
}

export async function recordAudit(actorId: number, action: string, detail: Record<string, unknown> = {}) {
  await exec(`INSERT INTO admin_audit_log (customer_id, action, detail) VALUES ($1, $2, $3)`, [
    actorId,
    action,
    JSON.stringify(detail),
  ]);
}

const MAX_ROWS = 500;

const globalForConsole = globalThis as unknown as { lucidConsolePool?: Pool };

/** Separate pool on the restricted console role; null when the console is not configured. */
function consolePool() {
  const url = env().SQL_CONSOLE_DATABASE_URL;
  if (!url) return null;
  globalForConsole.lucidConsolePool ??= new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 5_000,
    application_name: 'lucid-sql-console',
  });
  return globalForConsole.lucidConsolePool;
}

function displayValue(value: unknown) {
  if (Buffer.isBuffer(value)) return `<binary ${value.length} bytes>`;
  return value;
}

/**
 * Executes one read-only SQL statement for an admin. It runs as a dedicated login role that can
 * only SELECT from the `console` schema (no password hashes, sessions or audit log), inside a READ
 * ONLY transaction with a timeout. The connection is destroyed afterwards so no session state
 * (SET, advisory locks) can leak, and every attempt is written to the audit log.
 */
export async function runSqlConsole(actorId: number, sql: string): Promise<SqlResult> {
  const text = sql.trim().replace(/;\s*$/, '');
  if (!text) throw badRequest('Enter a SQL statement to run.');

  const consoleDb = consolePool();
  if (!consoleDb) throw serviceUnavailable('The SQL console is not configured on this server.');

  const client = await consoleDb.connect();
  const started = performance.now();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '5s'`);
    await client.query('SET LOCAL search_path = console');

    // The extended protocol rejects multiple statements, so "SELECT 1; DROP TABLE x" cannot run.
    // (queryMode is supported by pg at runtime but missing from @types/pg.)
    const config: QueryArrayConfig & { queryMode: 'extended' } = { text, rowMode: 'array', queryMode: 'extended' };
    const result = await client.query(config);
    await client.query('ROLLBACK');

    const rows = result.rows ?? [];
    const output: SqlResult = {
      command: result.command ?? 'OK',
      columns: (result.fields ?? []).map((field) => field.name),
      rows: rows.slice(0, MAX_ROWS).map((row) => row.map(displayValue)),
      rowCount: result.rowCount ?? rows.length,
      truncated: rows.length > MAX_ROWS,
      durationMs: Math.round(performance.now() - started),
    };
    await recordAudit(actorId, 'sql_console', { sql: text, ok: true, command: output.command, rowCount: output.rowCount });
    return output;
  } catch (error) {
    const message = error instanceof DatabaseError ? error.message : 'Query failed.';
    await recordAudit(actorId, 'sql_console', { sql: text, ok: false, error: message });
    if (error instanceof DatabaseError) {
      throw badRequest(error.code === '25006' ? 'The SQL console is read-only.' : message);
    }
    throw error;
  } finally {
    client.release(true);
  }
}

export async function listProductOptions() {
  return many<ProductOption>(
    `SELECT product_id AS id, name, is_active AS "isActive" FROM products ORDER BY is_active DESC, name`
  );
}

/** Live reference of what the SQL console can query, read from information_schema. */
export async function getSchemaReference() {
  return many<SchemaTable>(
    `SELECT table_name::text AS "table", array_agg(column_name::text ORDER BY ordinal_position) AS columns
     FROM information_schema.columns
     WHERE table_schema = 'console'
     GROUP BY table_name
     ORDER BY table_name`
  );
}
