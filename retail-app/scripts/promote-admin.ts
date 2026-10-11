/** Grants the admin role to an existing account:  npm run admin:promote -- someone@example.com */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run admin:promote -- <email>');

  const { pool, exec } = await import('../src/server/db');
  try {
    const updated = await exec(`UPDATE customers SET role = 'admin' WHERE email = $1`, [email]);
    if (!updated) throw new Error(`No account found for ${email}. Register it first.`);
    // Existing sessions were issued with customer lifetimes; force a fresh (short-lived) admin sign-in.
    await exec(`DELETE FROM sessions WHERE customer_id = (SELECT customer_id FROM customers WHERE email = $1)`, [email]);
    console.log(`${email} is now an admin.`);
  } finally {
    await pool().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
