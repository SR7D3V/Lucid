import { clientIp, json, readJson, route } from '@/server/http';
import { getCartOwner, rememberGuestCart } from '@/server/session';
import { addCartItem, getCart } from '@/server/services/cart';
import { enforceRateLimit } from '@/server/services/rate-limit';
import { addToCartSchema } from '@/server/validation';

export const POST = route(async (req) => {
  const owner = await getCartOwner();
  if (!owner.customerId) await enforceRateLimit(`cart:${clientIp(req)}`, 60, 60);

  const input = await readJson(req, addToCartSchema);
  const cartId = await addCartItem(owner, input);
  if (!owner.customerId && cartId !== owner.cartId) await rememberGuestCart(cartId);
  return json(await getCart(cartId), 201);
});
