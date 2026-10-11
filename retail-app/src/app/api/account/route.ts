import { json, readJson, route } from '@/server/http';
import { requireUser } from '@/server/session';
import { updateProfile } from '@/server/services/customers';
import { profileSchema } from '@/server/validation';

export const GET = route(async () => json({ customer: await requireUser() }));

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, profileSchema);
  return json({ customer: await updateProfile(user.id, input) });
});
