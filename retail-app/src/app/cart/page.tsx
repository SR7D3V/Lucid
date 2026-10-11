import type { Metadata } from 'next';
import { getCartId, getCurrentUser } from '@/server/session';
import { getCart } from '@/server/services/cart';
import CartView from './CartView';

export const metadata: Metadata = { title: 'Shopping Bag' };

export default async function CartPage() {
  const [cart, user] = await Promise.all([getCartId().then(getCart), getCurrentUser()]);

  return (
    <main className="container section page">
      <h1 className="section-title">Shopping Bag ({cart.itemCount})</h1>
      <CartView cart={cart} signedIn={Boolean(user)} />
    </main>
  );
}
