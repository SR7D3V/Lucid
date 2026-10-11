import { idParam, json, route } from '@/server/http';
import { requireUser } from '@/server/session';
import { cancelCustomerOrder } from '@/server/services/orders';

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const status = await cancelCustomerOrder(user.id, idParam((await params).id));
  return json({ status });
});
