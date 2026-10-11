import { json, route } from '@/server/http';
import { requireAdmin } from '@/server/session';
import { listAllOrders } from '@/server/services/orders';
import { orderStatusSchema } from '@/server/validation';

export const GET = route(async (req) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get('status');
  return json(await listAllOrders({ status: status ? orderStatusSchema.shape.status.parse(status) : undefined }));
});
