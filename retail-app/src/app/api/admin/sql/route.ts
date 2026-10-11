import { json, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/session';
import { runSqlConsole } from '@/server/services/admin';
import { sqlSchema } from '@/server/validation';

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const { query } = await readJson(req, sqlSchema);
  return json(await runSqlConsole(admin.id, query));
});
