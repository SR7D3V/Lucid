import type { Mail } from './mailer';
import { RESET_TOKEN_TTL_MINUTES } from './services/password-reset';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function passwordResetEmail(to: { name: string; email: string }, link: string): Mail {
  const name = to.name.split(' ')[0];
  return {
    to: to.email,
    subject: 'Reset your LUCID password',
    text: [
      `Hi ${name},`,
      '',
      'We received a request to reset the password for your LUCID account.',
      `Use the link below within ${RESET_TOKEN_TTL_MINUTES} minutes to choose a new password:`,
      '',
      link,
      '',
      "If you didn't request this, you can ignore this email. Your password won't change.",
      '',
      'LUCID',
    ].join('\n'),
    html: `<!doctype html>
<html><body style="margin:0;padding:32px;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;color:#111">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;padding:40px">
    <tr><td style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:2px;padding-bottom:28px">LUCID</td></tr>
    <tr><td style="font-size:15px;line-height:1.6">
      <p style="margin:0 0 16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px">We received a request to reset the password for your LUCID account.
        Use the button below within ${RESET_TOKEN_TTL_MINUTES} minutes to choose a new password.</p>
      <p style="margin:28px 0">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;
          padding:14px 28px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase">Reset password</a>
      </p>
      <p style="margin:0;color:#767676;font-size:13px">If you didn't request this, you can ignore this email.
        Your password won't change.</p>
    </td></tr>
  </table>
</body></html>`,
  };
}
