import 'server-only';
import { env, isProduction } from './env';

export type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Sends a transactional email through Resend's HTTP API. Without RESEND_API_KEY and MAIL_FROM,
 * development prints the email to the server console instead, and production refuses to run.
 */
export async function sendMail(mail: Mail) {
  const { RESEND_API_KEY, MAIL_FROM } = env();

  if (!RESEND_API_KEY || !MAIL_FROM) {
    if (isProduction()) throw new Error('Email is not configured: set RESEND_API_KEY and MAIL_FROM.');
    console.info(`\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!response.ok) {
    throw new Error(`Email provider responded ${response.status}: ${await response.text()}`);
  }
}
