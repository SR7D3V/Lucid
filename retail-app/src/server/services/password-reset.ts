import { badRequest } from '../errors';
import { exec, one, transaction } from '../db';
import { hashPassword } from './passwords';
import { generateToken, hashToken } from './tokens';

export const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Issues a reset token for the account with this email, replacing any earlier unused token.
 * Returns null when no account exists; callers must respond identically either way.
 */
export async function createPasswordResetToken(email: string) {
  return transaction(async (client) => {
    const customer = await one<{ id: number; name: string; email: string }>(
      `SELECT customer_id AS id, name, email FROM customers WHERE email = $1`,
      [email],
      client
    );
    if (!customer) return null;

    await exec(`DELETE FROM password_reset_tokens WHERE customer_id = $1`, [customer.id], client);
    const token = generateToken();
    await exec(
      `INSERT INTO password_reset_tokens (token_hash, customer_id, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [hashToken(token), customer.id, RESET_TOKEN_TTL_MINUTES],
      client
    );
    return { token, customer };
  });
}

/**
 * Sets a new password using a reset token. The token is consumed with DELETE ... RETURNING, so
 * concurrent attempts with the same link cannot both succeed. Every session for the account is
 * revoked, signing the user out on all devices.
 */
export async function resetPassword(token: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);

  return transaction(async (client) => {
    const row = await one<{ customerId: number; email: string }>(
      `DELETE FROM password_reset_tokens t
       USING customers c
       WHERE t.token_hash = $1 AND t.expires_at > now() AND c.customer_id = t.customer_id
       RETURNING t.customer_id AS "customerId", c.email`,
      [hashToken(token)],
      client
    );
    if (!row) throw badRequest('This reset link is invalid or has expired. Please request a new one.');

    // Rolls back the transaction, so the link stays usable for a better password.
    if (newPassword.toLowerCase().includes(row.email.split('@')[0])) {
      throw badRequest('password: must not contain your email address');
    }

    await exec(`UPDATE customers SET password_hash = $2 WHERE customer_id = $1`, [row.customerId, passwordHash], client);
    await exec(`DELETE FROM password_reset_tokens WHERE customer_id = $1`, [row.customerId], client);
    await exec(`DELETE FROM sessions WHERE customer_id = $1`, [row.customerId], client);
    return row.customerId;
  });
}
