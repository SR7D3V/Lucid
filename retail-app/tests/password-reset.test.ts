import { beforeEach, describe, expect, it } from 'vitest';
import { exec, many, one } from '@/server/db';
import { authenticate } from '@/server/services/customers';
import { createPasswordResetToken, resetPassword } from '@/server/services/password-reset';
import { createSession, findSessionCustomer, SESSION_TTL_SECONDS } from '@/server/services/sessions';
import { passwordResetEmail } from '@/server/emails';
import { createCustomer, resetData } from './fixtures';

beforeEach(resetData);

describe('password reset', () => {
  it('returns nothing for an unknown email, so callers can respond identically', async () => {
    expect(await createPasswordResetToken('nobody@test.dev')).toBeNull();
    expect(await many(`SELECT 1 FROM password_reset_tokens`)).toHaveLength(0);
  });

  it('stores only a hash of the token', async () => {
    const customer = await createCustomer();
    const reset = (await createPasswordResetToken(customer.email))!;
    const rows = await many<{ token_hash: Buffer }>(`SELECT token_hash FROM password_reset_tokens`);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash.toString('utf8')).not.toContain(reset.token);
  });

  it('changes the password, signs out every session and works only once', async () => {
    const customer = await createCustomer();
    const sessionA = await createSession(customer.id, SESSION_TTL_SECONDS.customer);
    const sessionB = await createSession(customer.id, SESSION_TTL_SECONDS.customer);
    const { token } = (await createPasswordResetToken(customer.email))!;

    await resetPassword(token, 'fresh-linen-2026');

    expect((await authenticate(customer.email, 'fresh-linen-2026'))?.id).toBe(customer.id);
    expect(await authenticate(customer.email, 'password123')).toBeNull();
    expect(await findSessionCustomer(sessionA)).toBeNull();
    expect(await findSessionCustomer(sessionB)).toBeNull();
    await expect(resetPassword(token, 'another-pass-77')).rejects.toMatchObject({ status: 400 });
  });

  it('lets only one of several concurrent uses of a link succeed', async () => {
    const customer = await createCustomer();
    const { token } = (await createPasswordResetToken(customer.email))!;
    const attempts = await Promise.allSettled(
      ['first-pass-111', 'second-pass-222', 'third-pass-333'].map((pw) => resetPassword(token, pw))
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
  });

  it('rejects expired and superseded links', async () => {
    const customer = await createCustomer();
    const first = (await createPasswordResetToken(customer.email))!;
    const second = (await createPasswordResetToken(customer.email))!;
    await expect(resetPassword(first.token, 'linen-summer-77')).rejects.toMatchObject({ status: 400 });

    await exec(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);
    await expect(resetPassword(second.token, 'linen-summer-77')).rejects.toMatchObject({ status: 400 });
    await expect(resetPassword('made-up-token-that-is-long-enough', 'linen-summer-77')).rejects.toMatchObject({ status: 400 });
  });

  it('keeps the link usable if the new password is rejected', async () => {
    const customer = await createCustomer();
    const { token } = (await createPasswordResetToken(customer.email))!;
    const localPart = customer.email.split('@')[0];

    await expect(resetPassword(token, `${localPart}-2026!`)).rejects.toMatchObject({ status: 400 });
    expect(await one(`SELECT 1 FROM password_reset_tokens`)).not.toBeNull();
    await resetPassword(token, 'linen-summer-77');
  });

  it('builds an email that links to the reset page and escapes user input', () => {
    const mail = passwordResetEmail({ name: '<b>Asha</b> K', email: 'asha@test.dev' }, 'https://shop.test/reset-password?token=abc');
    expect(mail.to).toBe('asha@test.dev');
    expect(mail.text).toContain('https://shop.test/reset-password?token=abc');
    expect(mail.html).toContain('&lt;b&gt;Asha&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Asha</b>');
  });
});
