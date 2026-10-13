import { clientIp, readJson, route } from '@/server/http';
import { signOut } from '@/server/session';
import { resetPassword } from '@/server/services/password-reset';
import { enforceRateLimit } from '@/server/services/rate-limit';
import { passwordResetConfirmSchema } from '@/server/validation';

export const POST = route(async (req) => {
  await enforceRateLimit(`reset-confirm:ip:${clientIp(req)}`, 20, 15 * 60);
  const { token, password } = await readJson(req, passwordResetConfirmSchema);
  await resetPassword(token, password);
  // Every session for the account was revoked; clear this browser's (now dead) cookie too.
  await signOut();
  return new Response(null, { status: 204 });
});
