import { json, route } from '@/server/http';
import { requireAdmin } from '@/server/session';
import { getOverview } from '@/server/services/admin';
import { listLowStock } from '@/server/services/inventory';

export const GET = route(async () => {
  await requireAdmin();
  const [overview, lowStock] = await Promise.all([getOverview(), listLowStock()]);
  return json({ ...overview, lowStockItems: lowStock });
});
