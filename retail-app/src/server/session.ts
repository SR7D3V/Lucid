import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Customer } from '@/lib/types';
import { forbidden, unauthorized } from './errors';
import { isProduction } from './env';
import { createSession, deleteSession, findSessionCustomer, SESSION_TTL_SECONDS } from './services/sessions';
import { findCustomerCartId, findGuestCartId, mergeGuestCart } from './services/cart';

// The __Host- prefix (HTTPS only) pins cookies to this exact host with path "/".
const cookieName = (name: string) => (isProduction() ? `__Host-${name}` : name);
const sessionCookie = () => cookieName('lucid_session');
const cartCookie = () => cookieName('lucid_cart');
const GUEST_CART_TTL_SECONDS = 30 * 24 * 60 * 60;

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSeconds,
});

// Expire with the same attributes it was set with; __Host- cookies ignore a deletion lacking Secure.
const clearCookie = (jar: Awaited<ReturnType<typeof cookies>>, name: string) => jar.set(name, '', cookieOptions(0));

/** The signed-in customer for this request (memoised per request), or null. */
export const getCurrentUser = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(sessionCookie())?.value;
  return token ? findSessionCustomer(token) : null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw forbidden();
  return user;
}

/**
 * Starts a fresh session (revoking any session this browser already held) and folds the guest
 * bag into the customer's bag.
 */
export async function signIn(customer: Pick<Customer, 'id' | 'role'>) {
  const jar = await cookies();
  const previous = jar.get(sessionCookie())?.value;
  if (previous) await deleteSession(previous);

  const guestCartId = await findGuestCartId(jar.get(cartCookie())?.value);
  if (guestCartId) await mergeGuestCart(guestCartId, customer.id);

  const ttl = SESSION_TTL_SECONDS[customer.role];
  jar.set(sessionCookie(), await createSession(customer.id, ttl), cookieOptions(ttl));
  clearCookie(jar, cartCookie());
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(sessionCookie())?.value;
  if (token) await deleteSession(token);
  clearCookie(jar, sessionCookie());
}

/** Read-only cart lookup, safe to call while rendering. */
export async function getCartId() {
  const user = await getCurrentUser();
  if (user) return findCustomerCartId(user.id);
  return findGuestCartId((await cookies()).get(cartCookie())?.value);
}

/** Who owns the bag for this request: the signed-in customer, or the guest cookie's cart (if any). */
export async function getCartOwner() {
  const user = await getCurrentUser();
  if (user) return { customerId: user.id, cartId: await findCustomerCartId(user.id) };
  return { customerId: null, cartId: await findGuestCartId((await cookies()).get(cartCookie())?.value) };
}

/** Remembers a newly created guest cart in the browser. Route handlers only. */
export async function rememberGuestCart(cartId: string) {
  (await cookies()).set(cartCookie(), cartId, cookieOptions(GUEST_CART_TTL_SECONDS));
}
