/** Housekeeping, intended for a daily cron: removes expired sessions, stale guest bags and old rate-limit windows. */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { pool, exec } = await import('../src/server/db');
  try {
    const sessions = await exec(`DELETE FROM sessions WHERE expires_at < now()`);
    const carts = await exec(`DELETE FROM carts WHERE customer_id IS NULL AND updated_at < now() - interval '30 days'`);
    const limits = await exec(`DELETE FROM rate_limits WHERE window_started_at < now() - interval '1 day'`);
    console.log(`Pruned ${sessions} session(s), ${carts} guest bag(s), ${limits} rate-limit window(s).`);
  } finally {
    await pool().end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
