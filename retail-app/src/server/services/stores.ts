import { DatabaseError } from 'pg';
import type { Store } from '@/lib/types';
import { conflict } from '../errors';
import { many, one } from '../db';

const STORE_COLUMNS = `
  s.store_id AS id,
  s.name,
  s.location,
  s.contact,
  count(i.product_id)::integer AS "productCount",
  coalesce(sum(i.quantity), 0)::integer AS "unitsInStock"`;

export async function listStores() {
  return many<Store>(
    `SELECT ${STORE_COLUMNS}
     FROM stores s
     LEFT JOIN inventory i ON i.store_id = s.store_id
     GROUP BY s.store_id
     ORDER BY s.name, s.location`
  );
}

export async function createStore(input: { name: string; location: string; contact: string | null }) {
  try {
    const row = await one<{ id: number }>(
      `INSERT INTO stores (name, location, contact) VALUES ($1, $2, $3) RETURNING store_id AS id`,
      [input.name, input.location, input.contact]
    );
    return (await one<Store>(
      `SELECT ${STORE_COLUMNS}
       FROM stores s LEFT JOIN inventory i ON i.store_id = s.store_id
       WHERE s.store_id = $1
       GROUP BY s.store_id`,
      [row!.id]
    ))!;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === '23505') {
      throw conflict('A store with this name and location already exists.');
    }
    throw error;
  }
}
