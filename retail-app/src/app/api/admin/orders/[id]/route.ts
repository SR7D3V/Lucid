import { idParam, json, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/session';
import { recordAudit } from '@/server/services/admin';
import { updateOrderStatus } from '@/server/services/orders';
import { orderStatusSchema } from '@/server/validation';

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const orderId = idParam((await params).id);
  const { status } = await readJson(req, orderStatusSchema);
  const updated = await updateOrderStatus(orderId, status);
  await recordAudit(admin.id, 'order.status', { orderId, status: updated });
  return json({ status: updated });
});
