/**
 * Seeds stores, the product catalogue (with images) and stock levels from db/seed.
 * Optionally creates an admin from ADMIN_EMAIL / ADMIN_PASSWORD. Safe to re-run.
 */
import { loadEnvConfig } from '@next/env';
import { readFile } from 'fs/promises';
import path from 'path';

loadEnvConfig(process.cwd());

type SeedProduct = {
  name: string;
  category: string;
  subcategory: string;
  price: number;
  description: string;
  image: string;
  stock: Record<string, number>;
};

const STORES = [
  { key: 'new-york', name: 'Lucid New York', location: 'New York' },
  { key: 'delhi', name: 'Lucid Delhi', location: 'Delhi' },
  { key: 'bangalore', name: 'Lucid Bangalore', location: 'Bangalore' },
];

async function main() {
  const { pool, one, exec, transaction, tagInventoryChange } = await import('../src/server/db');
  const { storeImage } = await import('../src/server/services/images');
  const { hashPassword } = await import('../src/server/services/passwords');
  const seedDir = path.join(process.cwd(), 'db', 'seed');

  try {
    const storeIds = new Map<string, number>();
    for (const store of STORES) {
      const row = await one<{ id: number }>(
        `WITH inserted AS (
           INSERT INTO stores (name, location) VALUES ($1, $2)
           ON CONFLICT (lower(name), lower(location)) DO NOTHING
           RETURNING store_id
         )
         SELECT store_id AS id FROM inserted
         UNION ALL
         SELECT store_id FROM stores WHERE lower(name) = lower($1) AND lower(location) = lower($2)
         LIMIT 1`,
        [store.name, store.location]
      );
      storeIds.set(store.key, row!.id);
    }
    console.log(`Stores ready (${storeIds.size}).`);

    const existing = await one<{ count: number }>('SELECT count(*)::integer AS count FROM products');
    if (existing!.count > 0) {
      console.log(`Catalogue already has ${existing!.count} products; skipping product seed.`);
    } else {
      const { products } = JSON.parse(await readFile(path.join(seedDir, 'catalog.json'), 'utf8')) as {
        products: SeedProduct[];
      };

      await transaction(async (client) => {
        await tagInventoryChange(client, 'restock');
        for (const product of products) {
          const imageId = await storeImage(client, await readFile(path.join(seedDir, 'images', product.image)));
          const row = await one<{ id: number }>(
            `INSERT INTO products (subcategory_id, name, description, price, image_id)
             SELECT s.subcategory_id, $3, $4, $5, $6
             FROM subcategories s JOIN categories c ON c.category_id = s.category_id
             WHERE c.slug = $1 AND s.slug = $2
             RETURNING product_id AS id`,
            [product.category, product.subcategory, product.name, product.description, product.price, imageId],
            client
          );
          if (!row) throw new Error(`Unknown category ${product.category}/${product.subcategory} for ${product.name}`);

          for (const [storeKey, quantity] of Object.entries(product.stock)) {
            await exec(
              'INSERT INTO inventory (store_id, product_id, quantity) VALUES ($1, $2, $3)',
              [storeIds.get(storeKey), row.id, quantity],
              client
            );
          }
        }
      });
      console.log(`Seeded ${products.length} products.`);
    }

    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      const minLength = process.env.NODE_ENV === 'production' ? 14 : 8;
      if (ADMIN_PASSWORD.length < minLength) throw new Error(`ADMIN_PASSWORD must be at least ${minLength} characters.`);

      // Only bootstraps a missing admin. Existing accounts are never modified by the seed;
      // use `npm run admin:promote` to grant the role to an existing customer.
      const created = await exec(
        `INSERT INTO customers (name, email, password_hash, role) VALUES ('Admin', lower($1), $2, 'admin')
         ON CONFLICT (email) DO NOTHING`,
        [ADMIN_EMAIL.trim(), await hashPassword(ADMIN_PASSWORD)]
      );
      console.log(created ? `Admin account created: ${ADMIN_EMAIL.trim().toLowerCase()}` : 'Admin account already exists; left unchanged.');
    } else {
      console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD to create an admin account.');
    }
  } finally {
    await pool().end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
