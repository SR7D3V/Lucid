import { json, route } from '@/server/http';
import { requireUser } from '@/server/session';
import { listCustomerOrders, placeOrder } from '@/server/services/orders';
import { checkoutKeySchema } from '@/server/validation';

export const GET = route(async () => {
  const user = await requireUser();
  return json(await listCustomerOrders(user.id));
});

/** Checks out the signed-in customer's bag. Requires an Idempotency-Key header (UUID). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const checkoutId = checkoutKeySchema.parse(req.headers.get('idempotency-key') ?? '');
  const { orderIds, replayed } = await placeOrder(user.id, checkoutId);
  return json({ orderIds }, replayed ? 200 : 201);
});
