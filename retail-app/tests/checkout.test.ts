import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { many } from '@/server/db';
import { HttpError } from '@/server/errors';
import { addCartItem, ensureCustomerCart, getCart, removeCartItem, updateCartItemQuantity } from '@/server/services/cart';
import { cancelCustomerOrder, listCustomerOrders, placeOrder, updateOrderStatus } from '@/server/services/orders';
import { createCustomer, createProduct, createStore, resetData, stockOf } from './fixtures';

describe('checkout', () => {
  let delhi: number;
  let mumbai: number;
  let top: number;
  let jeans: number;

  beforeEach(async () => {
    await resetData();
    delhi = await createStore('Delhi');
    mumbai = await createStore('Mumbai');
    top = await createProduct({ name: 'Linen Top', price: 1000, stock: { [delhi]: 5 } });
    jeans = await createProduct({ name: 'Jeans', price: 2500.5, stock: { [delhi]: 3, [mumbai]: 2 } });
  });

  it('splits the bag into one order per store, snapshots prices and decrements stock', async () => {
    const customer = await createCustomer();
    const cart = await ensureCustomerCart(customer.id);
    await addCartItem({ cartId: cart, customerId: null }, { productId: top, storeId: delhi, size: 'M', quantity: 2 });
    await addCartItem({ cartId: cart, customerId: null }, { productId: jeans, storeId: mumbai, size: 'L', quantity: 1 });

    const { orderIds } = await placeOrder(customer.id, randomUUID());

    expect(orderIds).toHaveLength(2);
    const orders = await listCustomerOrders(customer.id);
    expect(orders.map((o) => o.totalAmount).sort()).toEqual([2000, 2500.5]);
    expect(await stockOf(delhi, top)).toBe(3);
    expect(await stockOf(mumbai, jeans)).toBe(1);
    expect((await getCart(cart)).items).toHaveLength(0);

    const movements = await many<{ reason: string; order_id: number }>(
      `SELECT reason, order_id FROM inventory_movements WHERE reason = 'sale' ORDER BY movement_id`
    );
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => orderIds.includes(m.order_id))).toBe(true);
  });

  it('is idempotent for a repeated checkout key', async () => {
    const customer = await createCustomer();
    const cart = await ensureCustomerCart(customer.id);
    await addCartItem({ cartId: cart, customerId: null }, { productId: top, storeId: delhi, size: 'S', quantity: 1 });
    const key = randomUUID();

    const first = await placeOrder(customer.id, key);
    const second = await placeOrder(customer.id, key);

    expect(second).toEqual({ orderIds: first.orderIds, replayed: true });
    expect(await stockOf(delhi, top)).toBe(4);
  });

  it('counts different sizes of one product against the same stock', async () => {
    const customer = await createCustomer();
    const cart = await ensureCustomerCart(customer.id);
    await addCartItem({ cartId: cart, customerId: null }, { productId: jeans, storeId: delhi, size: 'S', quantity: 2 });
    await expect(addCartItem({ cartId: cart, customerId: null }, { productId: jeans, storeId: delhi, size: 'M', quantity: 2 })).rejects.toThrow(
      'Only 3 left'
    );
  });

  it('never oversells the last unit under concurrent checkouts', async () => {
    const customers = await Promise.all(Array.from({ length: 6 }, () => createCustomer()));
    for (const customer of customers) {
      await addCartItem({ cartId: await ensureCustomerCart(customer.id), customerId: customer.id }, { productId: jeans, storeId: mumbai, size: 'M', quantity: 2 });
    }

    const results = await Promise.allSettled(customers.map((c) => placeOrder(c.id, randomUUID())));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const failure of results.filter((r) => r.status === 'rejected')) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(HttpError);
      expect((failure as PromiseRejectedResult).reason.status).toBe(409);
    }
    expect(await stockOf(mumbai, jeans)).toBe(0);
  });

  it('restocks on cancellation and enforces status transitions', async () => {
    const customer = await createCustomer();
    const other = await createCustomer();
    await addCartItem({ cartId: await ensureCustomerCart(customer.id), customerId: customer.id }, { productId: top, storeId: delhi, size: 'M', quantity: 3 });
    const [orderId] = (await placeOrder(customer.id, randomUUID())).orderIds;
    expect(await stockOf(delhi, top)).toBe(2);

    await expect(cancelCustomerOrder(other.id, orderId)).rejects.toMatchObject({ status: 404 });
    await cancelCustomerOrder(customer.id, orderId);
    expect(await stockOf(delhi, top)).toBe(5);
    await expect(updateOrderStatus(orderId, 'shipped')).rejects.toMatchObject({ status: 409 });
  });

  it('keeps order totals consistent with order lines when the bag changes mid-checkout', async () => {
    const shirt = await createProduct({ name: 'Race Shirt', price: 799.99, stock: { [delhi]: 100 } });
    for (let round = 0; round < 10; round++) {
      const customer = await createCustomer();
      const cart = await ensureCustomerCart(customer.id);
      await addCartItem({ cartId: cart, customerId: customer.id }, { productId: shirt, storeId: delhi, size: 'M', quantity: 1 });
      const [line] = (await getCart(cart)).items;

      await Promise.allSettled([
        placeOrder(customer.id, randomUUID()),
        updateCartItemQuantity(cart, line.id, 3),
        removeCartItem(cart, line.id),
      ]);
    }

    const mismatched = await many(
      `SELECT o.order_id FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
       GROUP BY o.order_id HAVING o.total_amount <> sum(oi.quantity * oi.unit_price)`
    );
    expect(mismatched).toEqual([]);
    const sold = await many<{ sold: number }>(`SELECT coalesce(sum(quantity), 0)::int AS sold FROM order_items`);
    expect(await stockOf(delhi, shirt)).toBe(100 - sold[0].sold);
  });

  it('rejects an empty bag', async () => {
    const customer = await createCustomer();
    await expect(placeOrder(customer.id, randomUUID())).rejects.toMatchObject({ status: 400 });
  });
});
