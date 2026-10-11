import { json, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/session';
import { recordAudit } from '@/server/services/admin';
import { createStore, listStores } from '@/server/services/stores';
import { storeSchema } from '@/server/validation';

export const GET = route(async () => json(await listStores()));

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const store = await createStore(await readJson(req, storeSchema));
  await recordAudit(admin.id, 'store.create', { storeId: store.id, name: store.name });
  return json({ store }, 201);
});
