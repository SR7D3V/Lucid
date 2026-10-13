import { after } from 'next/server';
import { passwordResetEmail } from '@/server/emails';
import { clientIp, json, publicOrigin, readJson, route } from '@/server/http';
import { sendMail } from '@/server/mailer';
import { createPasswordResetToken } from '@/server/services/password-reset';
import { enforceRateLimit, recordHit } from '@/server/services/rate-limit';
import { passwordResetRequestSchema } from '@/server/validation';

const MAX_EMAILS_PER_ADDRESS_PER_HOUR = 3;

/**
 * Always answers 202 with the same body, and does the account lookup and email after the response
 * is sent, so neither the content nor the timing reveals whether an account exists.
 */
export const POST = route(async (req) => {
  await enforceRateLimit(`reset:ip:${clientIp(req)}`, 10, 15 * 60);
  const { email } = await readJson(req, passwordResetRequestSchema);
  const origin = publicOrigin(req);

  after(async () => {
    try {
      // Caps emails per address so the form can't be used to flood someone's inbox.
      const { hits } = await recordHit(`reset:email:${email}`, 60 * 60);
      if (hits > MAX_EMAILS_PER_ADDRESS_PER_HOUR) return;

      const reset = await createPasswordResetToken(email);
      if (!reset) return;
      const link = `${origin}/reset-password?token=${encodeURIComponent(reset.token)}`;
      await sendMail(passwordResetEmail(reset.customer, link));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', msg: 'password reset email failed', error: String(error) }));
    }
  });

  return json({ ok: true }, 202);
});
