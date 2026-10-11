import { createHash, randomBytes } from 'crypto';
import type { Customer } from '@/lib/types';
import { exec, one } from '../db';

/** Session lifetimes; admin sessions are short-lived because they unlock the SQL console. */
export const SESSION_TTL_SECONDS = { customer: 30 * 24 * 60 * 60, admin: 12 * 60 * 60 } as const;

const hashToken = (token: string) => createHash('sha256').update(token).digest();

export async function createSession(customerId: number, ttlSeconds: number) {
  const token = randomBytes(32).toString('base64url');
  await exec(
    `INSERT INTO sessions (token_hash, customer_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [hashToken(token), customerId, ttlSeconds]
  );
  return token;
}

/** Revokes every session for a customer (e.g. after a role or credential change). */
export async function deleteCustomerSessions(customerId: number) {
  await exec(`DELETE FROM sessions WHERE customer_id = $1`, [customerId]);
}

export async function findSessionCustomer(token: string) {
  return one<Customer>(
    `SELECT c.customer_id AS id, c.name, c.email, c.phone, c.role
     FROM sessions s
     JOIN customers c ON c.customer_id = s.customer_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
}

export async function deleteSession(token: string) {
  await exec(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
}
