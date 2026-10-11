import { unauthorized } from '@/server/errors';
import { clientIp, json, readJson, route } from '@/server/http';
import { signIn } from '@/server/session';
import { authenticate } from '@/server/services/customers';
import { assertUnderLimit, clearRateLimit, enforceRateLimit, recordHit } from '@/server/services/rate-limit';
import { loginSchema } from '@/server/validation';

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_ACCOUNT_AND_IP = 5;

/*
 * Two limits: every attempt counts against the IP (stops credential stuffing from one source),
 * and only failures count against an email+IP pair (stops guessing one account) — so an attacker
 * elsewhere can never lock a real customer out of their own account.
 */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  await enforceRateLimit(`login:ip:${ip}`, 30, WINDOW_SECONDS);

  const { email, password } = await readJson(req, loginSchema);
  const failureBucket = `login:fail:${email}:${ip}`;
  await assertUnderLimit(failureBucket, MAX_FAILURES_PER_ACCOUNT_AND_IP, WINDOW_SECONDS);

  const customer = await authenticate(email, password);
  if (!customer) {
    await recordHit(failureBucket, WINDOW_SECONDS);
    throw unauthorized('Incorrect email or password.');
  }

  await clearRateLimit(failureBucket);
  await signIn(customer);
  return json({ customer });
});
