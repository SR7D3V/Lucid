import { DatabaseError } from 'pg';
import type { Customer } from '@/lib/types';
import { conflict, notFound } from '../errors';
import { one, type Queryable } from '../db';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords';

const CUSTOMER_COLUMNS = `customer_id AS id, name, email, phone, role`;

export async function registerCustomer(input: { name: string; email: string; phone: string | null; password: string }) {
  const passwordHash = await hashPassword(input.password);
  try {
    const customer = await one<Customer>(
      `INSERT INTO customers (name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING ${CUSTOMER_COLUMNS}`,
      [input.name, input.email, input.phone, passwordHash]
    );
    return customer!;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === '23505') {
      throw conflict('An account with this email already exists.');
    }
    throw error;
  }
}

/** Returns the customer when the credentials match, otherwise null. */
export async function authenticate(email: string, password: string) {
  const row = await one<Customer & { password_hash: string }>(
    `SELECT ${CUSTOMER_COLUMNS}, password_hash FROM customers WHERE email = $1`,
    [email]
  );

  if (!row) {
    await burnPasswordCheck(password);
    return null;
  }

  if (!(await verifyPassword(password, row.password_hash))) return null;

  const { password_hash: _, ...customer } = row;
  return customer satisfies Customer;
}

export async function getCustomer(customerId: number, db?: Queryable) {
  return one<Customer>(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE customer_id = $1`, [customerId], db);
}

export async function updateProfile(customerId: number, input: { name: string; phone: string | null }) {
  const customer = await one<Customer>(
    `UPDATE customers SET name = $2, phone = $3 WHERE customer_id = $1 RETURNING ${CUSTOMER_COLUMNS}`,
    [customerId, input.name, input.phone]
  );
  if (!customer) throw notFound('Account not found.');
  return customer;
}
