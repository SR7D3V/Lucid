import { badRequest } from '../errors';
import { many, one, tagInventoryChange, transaction } from '../db';

/** Sets the absolute stock level of a product at a store, creating the row if needed. */
export async function setStock(storeId: number, productId: number, quantity: number) {
  return transaction(async (client) => {
    const current = await one<{ quantity: number }>(
      `SELECT quantity FROM inventory WHERE store_id = $1 AND product_id = $2 FOR UPDATE`,
      [storeId, productId],
      client
    );
    await tagInventoryChange(client, quantity > (current?.quantity ?? 0) ? 'restock' : 'adjustment');

    const row = await one<{ quantity: number }>(
      `INSERT INTO inventory (store_id, product_id, quantity)
       SELECT s.store_id, p.product_id, $3
       FROM stores s, products p
       WHERE s.store_id = $1 AND p.product_id = $2
       ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity
       RETURNING quantity`,
      [storeId, productId, quantity],
      client
    );
    if (!row) throw badRequest('Unknown store or product.');
    return { storeId, productId, quantity: row.quantity, previous: current?.quantity ?? 0 };
  });
}

export type LowStockItem = {
  storeId: number;
  storeName: string;
  productId: number;
  productName: string;
  quantity: number;
};

export async function listLowStock(threshold = 10, limit = 20) {
  return many<LowStockItem>(
    `SELECT i.store_id AS "storeId", s.name AS "storeName", p.product_id AS "productId",
            p.name AS "productName", i.quantity
     FROM inventory i
     JOIN products p ON p.product_id = i.product_id AND p.is_active
     JOIN stores s ON s.store_id = i.store_id
     WHERE i.quantity < $1
     ORDER BY i.quantity, p.name
     LIMIT $2`,
    [threshold, limit]
  );
}

export type InventoryMovement = {
  id: number;
  storeName: string;
  productName: string;
  delta: number;
  quantityAfter: number;
  reason: string;
  orderId: number | null;
  createdAt: string;
};

export async function listRecentMovements(limit = 15) {
  return many<InventoryMovement>(
    `SELECT m.movement_id AS id, s.name AS "storeName", p.name AS "productName", m.delta,
            m.quantity_after AS "quantityAfter", m.reason, m.order_id AS "orderId", m.created_at AS "createdAt"
     FROM inventory_movements m
     JOIN stores s ON s.store_id = m.store_id
     JOIN products p ON p.product_id = m.product_id
     ORDER BY m.movement_id DESC
     LIMIT $1`,
    [limit]
  );
}
