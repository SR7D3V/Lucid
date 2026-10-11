import { clientIp, json, readJson, route } from '@/server/http';
import { signIn } from '@/server/session';
import { registerCustomer } from '@/server/services/customers';
import { enforceRateLimit } from '@/server/services/rate-limit';
import { registerSchema } from '@/server/validation';

export const POST = route(async (req) => {
  await enforceRateLimit(`register:${clientIp(req)}`, 10, 60 * 60);
  const input = await readJson(req, registerSchema);
  const customer = await registerCustomer(input);
  await signIn(customer);
  return json({ customer }, 201);
});
