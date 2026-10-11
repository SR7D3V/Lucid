import { exec, one, tagInventoryChange, transaction } from '@/server/db';
import { registerCustomer } from '@/server/services/customers';

/** Clears all transactional data, keeping the migration-owned taxonomy. */
export async function resetData() {
  await exec(`TRUNCATE stores, products, product_images, customers, carts, orders, admin_audit_log, rate_limits
              RESTART IDENTITY CASCADE`);
}

export async function createStore(name: string) {
  return (await one<{ id: number }>(
    `INSERT INTO stores (name, location) VALUES ($1, $1) RETURNING store_id AS id`,
    [name]
  ))!.id;
}

export async function createProduct(opts: {
  name: string;
  price: number;
  category?: string;
  subcategory?: string;
  stock: Record<number, number>;
}) {
  return transaction(async (client) => {
    const product = await one<{ id: number }>(
      `INSERT INTO products (subcategory_id, name, price)
       SELECT s.subcategory_id, $3, $4 FROM subcategories s JOIN categories c USING (category_id)
       WHERE c.slug = $1 AND s.slug = $2
       RETURNING product_id AS id`,
      [opts.category ?? 'ladies', opts.subcategory ?? 'tops', opts.name, opts.price],
      client
    );
    await tagInventoryChange(client, 'restock');
    for (const [storeId, quantity] of Object.entries(opts.stock)) {
      await exec(`INSERT INTO inventory (store_id, product_id, quantity) VALUES ($1, $2, $3)`, [storeId, product!.id, quantity], client);
    }
    return product!.id;
  });
}

let counter = 0;
export async function createCustomer() {
  counter++;
  return registerCustomer({ name: `Customer ${counter}`, email: `c${counter}-${Date.now()}@test.dev`, phone: null, password: 'password123' });
}

export async function stockOf(storeId: number, productId: number) {
  return (await one<{ quantity: number }>(
    `SELECT quantity FROM inventory WHERE store_id = $1 AND product_id = $2`,
    [storeId, productId]
  ))!.quantity;
}
