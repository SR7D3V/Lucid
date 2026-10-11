import type { Cart, CartLine } from '@/lib/types';
import { MAX_LINE_QUANTITY, ONE_SIZE, SIZES } from '@/lib/constants';
import { badRequest, conflict, notFound } from '../errors';
import { exec, many, one, transaction, type Queryable } from '../db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findCustomerCartId(customerId: number, db?: Queryable) {
  const row = await one<{ id: string }>(`SELECT cart_id AS id FROM carts WHERE customer_id = $1`, [customerId], db);
  return row?.id ?? null;
}

export async function ensureCustomerCart(customerId: number, db?: Queryable) {
  const row = await one<{ id: string }>(
    `INSERT INTO carts (customer_id) VALUES ($1)
     ON CONFLICT (customer_id) DO UPDATE SET updated_at = now()
     RETURNING cart_id AS id`,
    [customerId],
    db
  );
  return row!.id;
}

/** Returns the guest cart id if it exists and has not been claimed by a customer. */
export async function findGuestCartId(cartId: string | undefined) {
  if (!cartId || !UUID.test(cartId)) return null;
  const row = await one<{ id: string }>(
    `SELECT cart_id AS id FROM carts WHERE cart_id = $1 AND customer_id IS NULL`,
    [cartId]
  );
  return row?.id ?? null;
}

const CART_LINE_QUERY = `
  SELECT ci.cart_item_id AS id,
         ci.product_id AS "productId",
         p.name,
         p.price,
         CASE WHEN p.image_id IS NULL THEN NULL ELSE '/api/images/' || p.image_id END AS "imageUrl",
         ci.size,
         ci.quantity,
         ci.store_id AS "storeId",
         s.name AS "storeName",
         i.quantity AS available,
         p.is_active AS "isActive"
  FROM cart_items ci
  JOIN products p ON p.product_id = ci.product_id
  JOIN stores s ON s.store_id = ci.store_id
  JOIN inventory i ON i.store_id = ci.store_id AND i.product_id = ci.product_id
  WHERE ci.cart_id = $1
  ORDER BY ci.added_at, ci.cart_item_id`;

export async function getCart(cartId: string | null, db?: Queryable): Promise<Cart> {
  const items = cartId ? await many<CartLine>(CART_LINE_QUERY, [cartId], db) : [];
  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100,
  };
}

export async function countCartItems(cartId: string | null) {
  if (!cartId) return 0;
  const row = await one<{ count: number }>(
    `SELECT coalesce(sum(quantity), 0)::integer AS count FROM cart_items WHERE cart_id = $1`,
    [cartId]
  );
  return row?.count ?? 0;
}

export type AddToCart = { productId: number; storeId: number; size: string; quantity: number };

/** Locks the cart row so every change to a bag (and checkout) is applied one at a time. */
async function lockCart(client: Queryable, cartId: string) {
  const row = await one(`SELECT 1 FROM carts WHERE cart_id = $1 FOR UPDATE`, [cartId], client);
  if (!row) throw notFound('Your bag could not be found. Please refresh and try again.');
}

/**
 * Adds an item to the owner's bag and returns the bag id. The bag itself is only created once
 * the item has been validated, so invalid requests never leave empty guest carts behind.
 */
export async function addCartItem(owner: { cartId: string | null; customerId: number | null }, input: AddToCart) {
  return transaction(async (client) => {
    const product = await one<{ isActive: boolean; hasSizes: boolean; available: number }>(
      `SELECT p.is_active AS "isActive", c.has_sizes AS "hasSizes", i.quantity AS available
       FROM products p
       JOIN subcategories s ON s.subcategory_id = p.subcategory_id
       JOIN categories c ON c.category_id = s.category_id
       JOIN inventory i ON i.product_id = p.product_id AND i.store_id = $2
       WHERE p.product_id = $1`,
      [input.productId, input.storeId],
      client
    );
    if (!product || !product.isActive) throw notFound('This product is not available at the selected store.');

    const validSize = product.hasSizes ? (SIZES as readonly string[]).includes(input.size) : input.size === ONE_SIZE;
    if (!validSize) throw badRequest('Please select a valid size.');
    if (product.available === 0) throw conflict('This store is out of stock for this item.');

    let cartId = owner.cartId;
    if (!cartId) {
      cartId = owner.customerId
        ? await ensureCustomerCart(owner.customerId, client)
        : (await one<{ id: string }>(`INSERT INTO carts DEFAULT VALUES RETURNING cart_id AS id`, [], client))!.id;
    }
    await lockCart(client, cartId);

    const inCart = await one<{ quantity: number; line: number }>(
      `SELECT coalesce(sum(quantity), 0)::integer AS quantity,
              coalesce(sum(quantity) FILTER (WHERE size = $4), 0)::integer AS line
       FROM cart_items WHERE cart_id = $1 AND store_id = $2 AND product_id = $3`,
      [cartId, input.storeId, input.productId, input.size],
      client
    );
    if (inCart!.line + input.quantity > MAX_LINE_QUANTITY) {
      throw badRequest(`You can add up to ${MAX_LINE_QUANTITY} of an item.`);
    }
    if (inCart!.quantity + input.quantity > product.available) {
      throw conflict(`Only ${product.available} left at this store.`);
    }

    await exec(
      `INSERT INTO cart_items (cart_id, store_id, product_id, size, quantity)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cart_id, store_id, product_id, size)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
      [cartId, input.storeId, input.productId, input.size, input.quantity],
      client
    );
    await exec(`UPDATE carts SET updated_at = now() WHERE cart_id = $1`, [cartId], client);
    return cartId;
  });
}

export async function updateCartItemQuantity(cartId: string, itemId: number, quantity: number) {
  await transaction(async (client) => {
    await lockCart(client, cartId);
    const line = await one<{ available: number; otherSizes: number }>(
      `SELECT i.quantity AS available,
              coalesce((
                SELECT sum(o.quantity) FROM cart_items o
                WHERE o.cart_id = ci.cart_id AND o.store_id = ci.store_id
                  AND o.product_id = ci.product_id AND o.cart_item_id <> ci.cart_item_id
              ), 0)::integer AS "otherSizes"
       FROM cart_items ci
       JOIN inventory i ON i.store_id = ci.store_id AND i.product_id = ci.product_id
       WHERE ci.cart_id = $1 AND ci.cart_item_id = $2
       FOR UPDATE OF ci`,
      [cartId, itemId],
      client
    );
    if (!line) throw notFound('That item is no longer in your bag.');
    if (line.otherSizes + quantity > line.available) {
      throw conflict(`Only ${line.available} left at this store.`);
    }
    await exec(`UPDATE cart_items SET quantity = $3 WHERE cart_id = $1 AND cart_item_id = $2`, [cartId, itemId, quantity], client);
  });
}

export async function removeCartItem(cartId: string, itemId: number) {
  await transaction(async (client) => {
    await lockCart(client, cartId);
    await exec(`DELETE FROM cart_items WHERE cart_id = $1 AND cart_item_id = $2`, [cartId, itemId], client);
  });
}

/** Moves a guest bag into the customer's bag at sign-in, summing duplicate lines. */
export async function mergeGuestCart(guestCartId: string, customerId: number) {
  await transaction(async (client) => {
    const customerCartId = await ensureCustomerCart(customerId, client);
    await lockCart(client, customerCartId);
    await exec(
      `INSERT INTO cart_items (cart_id, store_id, product_id, size, quantity, added_at)
       SELECT $2, store_id, product_id, size, quantity, added_at
       FROM cart_items
       WHERE cart_id = $1
       ON CONFLICT (cart_id, store_id, product_id, size)
       DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, ${MAX_LINE_QUANTITY})`,
      [guestCartId, customerCartId],
      client
    );
    await exec(`DELETE FROM carts WHERE cart_id = $1 AND customer_id IS NULL`, [guestCartId], client);
  });
}
