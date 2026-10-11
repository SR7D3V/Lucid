import { notFound } from '@/server/errors';
import { idParam, json, readJson, route } from '@/server/http';
import { getCartId } from '@/server/session';
import { getCart, removeCartItem, updateCartItemQuantity } from '@/server/services/cart';
import { cartQuantitySchema } from '@/server/validation';

type Ctx = { params: Promise<{ id: string }> };

async function requireCart() {
  const cartId = await getCartId();
  if (!cartId) throw notFound('Your bag is empty.');
  return cartId;
}

export const PATCH = route(async (req, { params }: Ctx) => {
  const itemId = idParam((await params).id);
  const { quantity } = await readJson(req, cartQuantitySchema);
  const cartId = await requireCart();
  await updateCartItemQuantity(cartId, itemId, quantity);
  return json(await getCart(cartId));
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const itemId = idParam((await params).id);
  const cartId = await requireCart();
  await removeCartItem(cartId, itemId);
  return json(await getCart(cartId));
});
