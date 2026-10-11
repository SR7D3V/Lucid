import type { WishlistItem } from '@/lib/types';
import { notFound } from '../errors';
import { exec, many, one } from '../db';
import { PRODUCT_SUMMARY_COLUMNS } from './catalog';

export async function listWishlist(customerId: number) {
  return many<WishlistItem>(
    `SELECT ${PRODUCT_SUMMARY_COLUMNS}, w.added_at AS "addedAt"
     FROM wishlist_items w
     JOIN product_catalog pc ON pc.product_id = w.product_id
     WHERE w.customer_id = $1 AND pc.is_active
     ORDER BY w.added_at DESC`,
    [customerId]
  );
}

export async function isWishlisted(customerId: number, productId: number) {
  return Boolean(
    await one(`SELECT 1 FROM wishlist_items WHERE customer_id = $1 AND product_id = $2`, [customerId, productId])
  );
}

export async function countWishlist(customerId: number) {
  const row = await one<{ count: number }>(
    `SELECT count(*)::integer AS count
     FROM wishlist_items w JOIN products p ON p.product_id = w.product_id
     WHERE w.customer_id = $1 AND p.is_active`,
    [customerId]
  );
  return row?.count ?? 0;
}

export async function addToWishlist(customerId: number, productId: number) {
  const inserted = await exec(
    `INSERT INTO wishlist_items (customer_id, product_id)
     SELECT $1, product_id FROM products WHERE product_id = $2 AND is_active
     ON CONFLICT DO NOTHING`,
    [customerId, productId]
  );
  if (!inserted && !(await isWishlisted(customerId, productId))) throw notFound('Product not found.');
}

export async function removeFromWishlist(customerId: number, productId: number) {
  await exec(`DELETE FROM wishlist_items WHERE customer_id = $1 AND product_id = $2`, [customerId, productId]);
}
