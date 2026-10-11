import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { env } from './env';

// numeric -> number (prices fit comfortably in a double), int8 -> number (counts),
// timestamptz -> ISO string so rows serialise identically over JSON and RSC.
types.setTypeParser(types.builtins.NUMERIC, Number.parseFloat);
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());

const globalForPool = globalThis as unknown as { lucidPool?: Pool };

export function pool() {
  if (!globalForPool.lucidPool) {
    const { DATABASE_URL, DATABASE_POOL_SIZE } = env();
    globalForPool.lucidPool = new Pool({
      connectionString: DATABASE_URL,
      max: DATABASE_POOL_SIZE,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'lucid-retail',
    });
    globalForPool.lucidPool.on('error', (error) => {
      console.error(JSON.stringify({ level: 'error', msg: 'idle postgres client error', error: error.message }));
    });
  }
  return globalForPool.lucidPool;
}

export type Queryable = Pick<PoolClient, 'query'>;

export async function many<T extends QueryResultRow>(text: string, values: unknown[] = [], db: Queryable = pool()) {
  const result = await db.query<T>(text, values);
  return result.rows;
}

export async function one<T extends QueryResultRow>(text: string, values: unknown[] = [], db: Queryable = pool()) {
  const result = await db.query<T>(text, values);
  return result.rows[0] ?? null;
}

export async function exec(text: string, values: unknown[] = [], db: Queryable = pool()) {
  const result = await db.query(text, values);
  return result.rowCount ?? 0;
}

/** Runs `work` inside a transaction, rolling back on any thrown error. */
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Sets transaction-local settings read by the inventory ledger trigger. */
export async function tagInventoryChange(
  client: Queryable,
  reason: 'restock' | 'adjustment' | 'sale' | 'cancellation' | 'sql_console',
  orderId: number | null = null
) {
  await client.query(
    `SELECT set_config('lucid.inventory_reason', $1, true), set_config('lucid.order_id', $2, true)`,
    [reason, orderId === null ? '' : String(orderId)]
  );
}
