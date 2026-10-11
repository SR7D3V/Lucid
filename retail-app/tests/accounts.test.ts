import { beforeEach, describe, expect, it } from 'vitest';
import { many, one } from '@/server/db';
import { authenticate, registerCustomer } from '@/server/services/customers';
import { addCartItem, ensureCustomerCart, getCart, mergeGuestCart } from '@/server/services/cart';
import { createSession, deleteSession, findSessionCustomer, SESSION_TTL_SECONDS } from '@/server/services/sessions';
import { assertUnderLimit, clearRateLimit, enforceRateLimit, recordHit } from '@/server/services/rate-limit';
import { registerSchema } from '@/server/validation';
import { createCustomer, createProduct, createStore, resetData } from './fixtures';

beforeEach(resetData);

describe('registration and login', () => {
  it('hashes passwords, rejects duplicates and authenticates', async () => {
    const customer = await registerCustomer({ name: 'Asha', email: 'asha@test.dev', phone: null, password: 'correct-horse' });
    const stored = await one<{ password_hash: string }>(`SELECT password_hash FROM customers WHERE customer_id = $1`, [customer.id]);
    expect(stored!.password_hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);

    await expect(registerCustomer({ name: 'Dup', email: 'asha@test.dev', phone: null, password: 'x'.repeat(8) })).rejects.toMatchObject({ status: 409 });
    expect(await authenticate('asha@test.dev', 'wrong-password')).toBeNull();
    expect(await authenticate('nobody@test.dev', 'correct-horse')).toBeNull();
    expect((await authenticate('asha@test.dev', 'correct-horse'))?.id).toBe(customer.id);
  });

  it('enforces the password policy and normalises emails', () => {
    const base = { name: 'Ravi', email: '  Ravi.K@Example.COM ', phone: '' };
    expect(registerSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'password123' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'aaaaaaaaaa' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'ravi.k-2026!' }).success).toBe(false);

    const ok = registerSchema.parse({ ...base, password: 'linen-summer-77' });
    expect(ok.email).toBe('ravi.k@example.com');
    expect(ok.phone).toBeNull();
  });
});

describe('sessions', () => {
  it('stores only token hashes, honours expiry and revokes', async () => {
    const customer = await createCustomer();
    const token = await createSession(customer.id, SESSION_TTL_SECONDS.customer);
    const rows = await many<{ token_hash: Buffer }>(`SELECT token_hash FROM sessions`);
    expect(rows.every((row) => !row.token_hash.toString('utf8').includes(token))).toBe(true);
    expect((await findSessionCustomer(token))?.id).toBe(customer.id);

    await deleteSession(token);
    expect(await findSessionCustomer(token)).toBeNull();

    const expired = await createSession(customer.id, -1);
    expect(await findSessionCustomer(expired)).toBeNull();
    expect(await findSessionCustomer('forged-token')).toBeNull();
  });

  it('gives admins a much shorter session than customers', () => {
    expect(SESSION_TTL_SECONDS.admin).toBeLessThanOrEqual(12 * 60 * 60);
    expect(SESSION_TTL_SECONDS.customer).toBeGreaterThan(SESSION_TTL_SECONDS.admin);
  });
});

describe('rate limiting', () => {
  it('blocks once a bucket exceeds its limit', async () => {
    for (let i = 0; i < 3; i++) await enforceRateLimit('test:bucket', 3, 60);
    await expect(enforceRateLimit('test:bucket', 3, 60)).rejects.toMatchObject({ status: 429 });
    await enforceRateLimit('test:other', 3, 60);
  });

  it('counts only failures for login lockout and resets on success', async () => {
    const bucket = 'login:fail:victim@test.dev:203.0.113.9';
    for (let i = 0; i < 5; i++) {
      await assertUnderLimit(bucket, 5, 900);
      await recordHit(bucket, 900);
    }
    await expect(assertUnderLimit(bucket, 5, 900)).rejects.toMatchObject({ status: 429 });
    // The same account from another address is unaffected, so attackers cannot lock users out.
    await assertUnderLimit('login:fail:victim@test.dev:198.51.100.4', 5, 900);

    await clearRateLimit(bucket);
    await assertUnderLimit(bucket, 5, 900);
  });
});

describe('bags', () => {
  it('merges a guest bag into the customer bag at sign-in', async () => {
    const store = await createStore('Delhi');
    const product = await createProduct({ name: 'Candle', price: 499, category: 'home', subcategory: 'decor', stock: { [store]: 20 } });
    const customer = await createCustomer();
    await addCartItem({ cartId: null, customerId: customer.id }, { productId: product, storeId: store, size: 'One Size', quantity: 2 });

    const guest = await addCartItem({ cartId: null, customerId: null }, { productId: product, storeId: store, size: 'One Size', quantity: 3 });
    await mergeGuestCart(guest, customer.id);

    const cart = await getCart(await ensureCustomerCart(customer.id));
    expect(cart.items).toHaveLength(1);
    expect(cart.itemCount).toBe(5);
    expect(await one(`SELECT 1 FROM carts WHERE cart_id = $1`, [guest])).toBeNull();
  });

  it('never creates a bag for an invalid item', async () => {
    const store = await createStore('Delhi');
    const product = await createProduct({ name: 'Shirt', price: 999, stock: { [store]: 4 } });
    const guest = { cartId: null, customerId: null };

    await expect(addCartItem(guest, { productId: 999_999, storeId: store, size: 'M', quantity: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(addCartItem(guest, { productId: product, storeId: store, size: 'One Size', quantity: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(addCartItem(guest, { productId: product, storeId: store, size: 'M', quantity: 5 })).rejects.toMatchObject({ status: 409 });
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM carts`))!.n).toBe(0);
  });

  it('caps a line at 10 units and rejects archived products', async () => {
    const store = await createStore('Delhi');
    const product = await createProduct({ name: 'Tee', price: 499, stock: { [store]: 50 } });
    const cartId = await addCartItem({ cartId: null, customerId: null }, { productId: product, storeId: store, size: 'S', quantity: 10 });
    await expect(addCartItem({ cartId, customerId: null }, { productId: product, storeId: store, size: 'S', quantity: 1 })).rejects.toMatchObject({ status: 400 });

    await one(`UPDATE products SET is_active = false WHERE product_id = $1`, [product]);
    await expect(addCartItem({ cartId, customerId: null }, { productId: product, storeId: store, size: 'M', quantity: 1 })).rejects.toMatchObject({ status: 404 });
  });
});
