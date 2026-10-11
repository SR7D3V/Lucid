import type { Category, Page, ProductDetail, ProductSummary } from '@/lib/types';
import type { ProductSort } from '@/lib/constants';
import { badRequest, notFound } from '../errors';
import { exec, many, one, tagInventoryChange, transaction } from '../db';
import { storeImage } from './images';

/** Column list over the product_catalog view (aliased "pc") matching ProductSummary. */
export const PRODUCT_SUMMARY_COLUMNS = `
  pc.product_id AS id,
  pc.name,
  pc.description,
  pc.price,
  CASE WHEN pc.image_id IS NULL THEN NULL ELSE '/api/images/' || pc.image_id END AS "imageUrl",
  pc.category_slug AS "categorySlug",
  pc.category_name AS "categoryName",
  pc.subcategory_slug AS "subcategorySlug",
  pc.subcategory_name AS "subcategoryName",
  pc.has_sizes AS "hasSizes",
  pc.total_stock AS "totalStock",
  pc.default_store_id AS "defaultStoreId"`;

export async function listCategories() {
  return many<Category>(
    `SELECT c.slug, c.name, c.has_sizes AS "hasSizes",
            json_agg(json_build_object('slug', s.slug, 'name', s.name) ORDER BY s.sort_order) AS subcategories
     FROM categories c
     JOIN subcategories s ON s.category_id = c.category_id
     GROUP BY c.category_id
     ORDER BY c.sort_order`
  );
}

export type ProductFilters = {
  category?: string;
  subcategory?: string;
  q?: string;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export async function listProducts(filters: ProductFilters): Promise<Page<ProductSummary>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 24));
  const params: unknown[] = [];
  const where = ['pc.is_active', 'pc.total_stock > 0'];
  const param = (value: unknown) => `$${params.push(value)}`;

  if (filters.category) where.push(`pc.category_slug = ${param(filters.category)}`);
  if (filters.subcategory) where.push(`pc.subcategory_slug = ${param(filters.subcategory)}`);

  let rank = '0';
  const q = filters.q?.trim();
  if (q) {
    // Full-text match, substring match, and trigram word similarity (tolerates typos like "linnen").
    const text = param(q);
    const tsQuery = `websearch_to_tsquery('english', ${text})`;
    const like = param(`%${escapeLike(q)}%`);
    where.push(`(
      pc.search_vector @@ ${tsQuery}
      OR pc.name ILIKE ${like}
      OR ${text} <% pc.name
      OR pc.category_name ILIKE ${like}
      OR pc.subcategory_name ILIKE ${like}
    )`);
    rank = `ts_rank(pc.search_vector, ${tsQuery}) + word_similarity(${text}, pc.name)`;
  }

  const sort = filters.sort ?? (q ? 'relevance' : 'newest');
  const orderBy = {
    relevance: `${rank} DESC, pc.created_at DESC`,
    newest: 'pc.created_at DESC',
    'price-asc': 'pc.price ASC',
    'price-desc': 'pc.price DESC',
  }[sort];

  const rows = await many<ProductSummary & { total: number }>(
    `SELECT ${PRODUCT_SUMMARY_COLUMNS}, count(*) OVER () AS total
     FROM product_catalog pc
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}, pc.product_id DESC
     LIMIT ${param(pageSize)} OFFSET ${param((page - 1) * pageSize)}`,
    params
  );

  const total = rows[0]?.total ?? 0;
  return {
    items: rows.map(({ total: _, ...item }) => item),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Best sellers over the last 30 days, topped up with the newest arrivals. */
export async function listTrendingProducts(limit = 12) {
  return many<ProductSummary>(
    `SELECT ${PRODUCT_SUMMARY_COLUMNS}
     FROM product_catalog pc
     LEFT JOIN (
       SELECT oi.product_id, sum(oi.quantity) AS units
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE o.status <> 'cancelled' AND o.placed_at > now() - interval '30 days'
       GROUP BY oi.product_id
     ) sales ON sales.product_id = pc.product_id
     WHERE pc.is_active AND pc.total_stock > 0
     ORDER BY coalesce(sales.units, 0) DESC, pc.created_at DESC, pc.product_id DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getProduct(productId: number, { includeArchived = false } = {}) {
  const product = await one<ProductDetail>(
    `SELECT ${PRODUCT_SUMMARY_COLUMNS},
            pc.is_active AS "isActive",
            coalesce((
              SELECT json_agg(json_build_object(
                       'storeId', s.store_id, 'name', s.name, 'location', s.location, 'quantity', i.quantity
                     ) ORDER BY i.quantity DESC, s.name)
              FROM inventory i
              JOIN stores s ON s.store_id = i.store_id
              WHERE i.product_id = pc.product_id
            ), '[]') AS stores
     FROM product_catalog pc
     WHERE pc.product_id = $1`,
    [productId]
  );

  if (!product || (!product.isActive && !includeArchived)) return null;
  return product;
}

async function resolveSubcategoryId(category: string, subcategory: string) {
  const row = await one<{ id: number }>(
    `SELECT s.subcategory_id AS id
     FROM subcategories s
     JOIN categories c ON c.category_id = s.category_id
     WHERE c.slug = $1 AND s.slug = $2`,
    [category, subcategory]
  );
  if (!row) throw badRequest('Unknown category or subcategory.');
  return row.id;
}

export type NewProduct = {
  name: string;
  description: string | null;
  price: number;
  category: string;
  subcategory: string;
  storeId: number;
  quantity: number;
  image: Buffer;
};

export async function createProduct(input: NewProduct) {
  const subcategoryId = await resolveSubcategoryId(input.category, input.subcategory);

  const store = await one(`SELECT 1 FROM stores WHERE store_id = $1`, [input.storeId]);
  if (!store) throw badRequest('Selected store was not found.');

  const productId = await transaction(async (client) => {
    const imageId = await storeImage(client, input.image);
    const product = await one<{ id: number }>(
      `INSERT INTO products (subcategory_id, name, description, price, image_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING product_id AS id`,
      [subcategoryId, input.name, input.description, input.price, imageId],
      client
    );

    await tagInventoryChange(client, 'restock');
    await exec(
      `INSERT INTO inventory (store_id, product_id, quantity) VALUES ($1, $2, $3)`,
      [input.storeId, product!.id, input.quantity],
      client
    );
    return product!.id;
  });

  return (await getProduct(productId))!;
}

export type ProductPatch = Partial<{
  name: string;
  description: string | null;
  price: number;
  category: string;
  subcategory: string;
  isActive: boolean;
}>;

export async function updateProduct(productId: number, patch: ProductPatch) {
  const sets: string[] = [];
  const params: unknown[] = [productId];
  const set = (column: string, value: unknown) => sets.push(`${column} = $${params.push(value)}`);

  if (patch.name !== undefined) set('name', patch.name);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.price !== undefined) set('price', patch.price);
  if (patch.isActive !== undefined) set('is_active', patch.isActive);
  if (patch.category !== undefined || patch.subcategory !== undefined) {
    if (!patch.category || !patch.subcategory) throw badRequest('category and subcategory must be changed together.');
    set('subcategory_id', await resolveSubcategoryId(patch.category, patch.subcategory));
  }
  if (sets.length === 0) throw badRequest('No changes supplied.');

  const updated = await exec(`UPDATE products SET ${sets.join(', ')} WHERE product_id = $1`, params);
  if (!updated) throw notFound('Product not found.');
  return (await getProduct(productId, { includeArchived: true }))!;
}

/** Archives instead of deleting so existing orders keep their product reference. */
export async function archiveProduct(productId: number) {
  const updated = await exec(`UPDATE products SET is_active = false WHERE product_id = $1`, [productId]);
  if (!updated) throw notFound('Product not found.');
}
