import type { PoolClient } from 'pg';
import type { AdminOrder, Order, OrderStatus } from '@/lib/types';
import { ORDER_TRANSITIONS } from '@/lib/constants';
import { badRequest, conflict, notFound } from '../errors';
import { exec, many, one, tagInventoryChange, transaction } from '../db';

const ORDER_COLUMNS = `
  o.order_id AS id,
  o.status,
  o.total_amount AS "totalAmount",
  o.placed_at AS "placedAt",
  s.name AS "storeName"`;

export async function listCustomerOrders(customerId: number) {
  return many<Order>(
    `SELECT ${ORDER_COLUMNS},
            json_agg(json_build_object(
              'productId', p.product_id,
              'name', p.name,
              'imageUrl', CASE WHEN p.image_id IS NULL THEN NULL ELSE '/api/images/' || p.image_id END,
              'size', oi.size,
              'quantity', oi.quantity,
              'unitPrice', oi.unit_price
            ) ORDER BY oi.order_item_id) AS items
     FROM orders o
     JOIN stores s ON s.store_id = o.store_id
     JOIN order_items oi ON oi.order_id = o.order_id
     JOIN products p ON p.product_id = oi.product_id
     WHERE o.customer_id = $1
     GROUP BY o.order_id, s.name
     ORDER BY o.placed_at DESC, o.order_id DESC`,
    [customerId]
  );
}

type ShortfallRow = { name: string; storeName: string; available: number; requested: number };

/**
 * Converts the customer's bag into orders, one per fulfilling store, atomically.
 *
 * Concurrency: the cart row is locked first so a customer's checkouts serialise, then the
 * inventory rows are locked in a deterministic order (store, product) so concurrent checkouts
 * by different customers cannot deadlock or oversell. `checkoutId` makes retries idempotent.
 */
export async function placeOrder(customerId: number, checkoutId: string) {
  return transaction(async (client) => {
    const cart = await one<{ id: string }>(
      `SELECT cart_id AS id FROM carts WHERE customer_id = $1 FOR UPDATE`,
      [customerId],
      client
    );

    const previous = await existingCheckout(client, customerId, checkoutId);
    if (previous.length > 0) return { orderIds: previous, replayed: true };
    if (!cart) throw badRequest('Your bag is empty.');

    // Freeze the prices this checkout reads until it commits (admin price edits wait for us).
    await exec(
      `SELECT 1 FROM products
       WHERE product_id IN (SELECT product_id FROM cart_items WHERE cart_id = $1)
       ORDER BY product_id
       FOR SHARE`,
      [cart.id],
      client
    );

    const inactive = await many<{ name: string }>(
      `SELECT p.name FROM cart_items ci JOIN products p ON p.product_id = ci.product_id
       WHERE ci.cart_id = $1 AND NOT p.is_active`,
      [cart.id],
      client
    );
    if (inactive.length > 0) {
      throw conflict(`${inactive.map((row) => row.name).join(', ')} is no longer available. Please remove it from your bag.`);
    }

    // Lock every inventory row this checkout touches, in a stable order, then check stock.
    await exec(
      `SELECT 1 FROM inventory
       WHERE (store_id, product_id) IN (SELECT store_id, product_id FROM cart_items WHERE cart_id = $1)
       ORDER BY store_id, product_id
       FOR UPDATE`,
      [cart.id],
      client
    );
    const shortfalls = await many<ShortfallRow>(
      `SELECT p.name, s.name AS "storeName", i.quantity AS available, d.requested
       FROM (
         SELECT store_id, product_id, sum(quantity)::integer AS requested
         FROM cart_items WHERE cart_id = $1
         GROUP BY store_id, product_id
       ) d
       JOIN inventory i ON i.store_id = d.store_id AND i.product_id = d.product_id
       JOIN products p ON p.product_id = d.product_id
       JOIN stores s ON s.store_id = d.store_id
       WHERE i.quantity < d.requested`,
      [cart.id],
      client
    );
    if (shortfalls.length > 0) {
      const detail = shortfalls
        .map((row) => `${row.name} (${row.available} left at ${row.storeName})`)
        .join(', ');
      throw conflict(`Not enough stock for: ${detail}.`);
    }

    const orders = await many<{ id: number; storeId: number }>(
      `INSERT INTO orders (customer_id, store_id, checkout_id, total_amount)
       SELECT DISTINCT $1::integer, store_id, $2::uuid, 0
       FROM cart_items
       WHERE cart_id = $3
       ORDER BY store_id
       RETURNING order_id AS id, store_id AS "storeId"`,
      [customerId, checkoutId, cart.id],
      client
    );
    if (orders.length === 0) throw badRequest('Your bag is empty.');

    await exec(
      `INSERT INTO order_items (order_id, product_id, size, quantity, unit_price)
       SELECT o.order_id, ci.product_id, ci.size, ci.quantity, p.price
       FROM cart_items ci
       JOIN products p ON p.product_id = ci.product_id
       JOIN orders o ON o.customer_id = $1 AND o.checkout_id = $2 AND o.store_id = ci.store_id
       WHERE ci.cart_id = $3`,
      [customerId, checkoutId, cart.id],
      client
    );

    // Totals are derived from the recorded lines, so they can never disagree with them.
    await exec(
      `UPDATE orders o
       SET total_amount = t.total
       FROM (
         SELECT order_id, sum(quantity * unit_price) AS total
         FROM order_items
         WHERE order_id = ANY($1::integer[])
         GROUP BY order_id
       ) t
       WHERE o.order_id = t.order_id`,
      [orders.map((order) => order.id)],
      client
    );

    for (const order of orders) {
      await tagInventoryChange(client, 'sale', order.id);
      await exec(
        `UPDATE inventory i
         SET quantity = i.quantity - d.requested
         FROM (
           SELECT product_id, sum(quantity)::integer AS requested
           FROM cart_items WHERE cart_id = $1 AND store_id = $2
           GROUP BY product_id
         ) d
         WHERE i.store_id = $2 AND i.product_id = d.product_id`,
        [cart.id, order.storeId],
        client
      );
    }

    await exec(`DELETE FROM cart_items WHERE cart_id = $1`, [cart.id], client);
    return { orderIds: orders.map((order) => order.id), replayed: false };
  });
}

async function existingCheckout(client: PoolClient, customerId: number, checkoutId: string) {
  const rows = await many<{ id: number }>(
    `SELECT order_id AS id FROM orders WHERE customer_id = $1 AND checkout_id = $2 ORDER BY order_id`,
    [customerId, checkoutId],
    client
  );
  return rows.map((row) => row.id);
}

/** Moves an order to a new status, restocking inventory when it is cancelled. */
async function transitionOrder(orderId: number, next: OrderStatus, customerId: number | null) {
  return transaction(async (client) => {
    const order = await one<{ status: OrderStatus; storeId: number }>(
      `SELECT status, store_id AS "storeId" FROM orders
       WHERE order_id = $1 AND ($2::integer IS NULL OR customer_id = $2)
       FOR UPDATE`,
      [orderId, customerId],
      client
    );
    if (!order) throw notFound('Order not found.');
    if (order.status === next) return order.status;
    if (!ORDER_TRANSITIONS[order.status].includes(next)) {
      throw conflict(`A ${order.status} order cannot be marked ${next}.`);
    }

    await exec(`UPDATE orders SET status = $2 WHERE order_id = $1`, [orderId, next], client);

    if (next === 'cancelled') {
      await tagInventoryChange(client, 'cancellation', orderId);
      await exec(
        `INSERT INTO inventory (store_id, product_id, quantity)
         SELECT $2, product_id, sum(quantity) FROM order_items WHERE order_id = $1 GROUP BY product_id
         ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
        [orderId, order.storeId],
        client
      );
    }
    return next;
  });
}

export const cancelCustomerOrder = (customerId: number, orderId: number) =>
  transitionOrder(orderId, 'cancelled', customerId);

export const updateOrderStatus = (orderId: number, status: OrderStatus) => transitionOrder(orderId, status, null);

export async function listAllOrders(filters: { status?: OrderStatus; limit?: number } = {}) {
  return many<AdminOrder>(
    `SELECT ${ORDER_COLUMNS},
            c.name AS "customerName",
            c.email AS "customerEmail",
            (SELECT sum(quantity)::integer FROM order_items oi WHERE oi.order_id = o.order_id) AS "itemCount"
     FROM orders o
     JOIN stores s ON s.store_id = o.store_id
     JOIN customers c ON c.customer_id = o.customer_id
     WHERE $1::order_status IS NULL OR o.status = $1
     ORDER BY o.placed_at DESC, o.order_id DESC
     LIMIT $2`,
    [filters.status ?? null, Math.min(filters.limit ?? 50, 200)]
  );
}
