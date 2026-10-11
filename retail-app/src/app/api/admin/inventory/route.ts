import { json, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/session';
import { recordAudit } from '@/server/services/admin';
import { listRecentMovements, setStock } from '@/server/services/inventory';
import { stockSchema } from '@/server/validation';

export const GET = route(async () => {
  await requireAdmin();
  return json(await listRecentMovements(50));
});

export const PUT = route(async (req) => {
  const admin = await requireAdmin();
  const { storeId, productId, quantity } = await readJson(req, stockSchema);
  const result = await setStock(storeId, productId, quantity);
  await recordAudit(admin.id, 'inventory.set', result);
  return json(result);
});
