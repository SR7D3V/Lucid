'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ProductImage from '@/components/ProductImage';
import { api, errorMessage } from '@/lib/api';
import { MAX_LINE_QUANTITY } from '@/lib/constants';
import { formatPrice } from '@/lib/format';
import type { Cart, CartLine } from '@/lib/types';

function lineProblem(line: CartLine) {
  if (!line.isActive) return 'No longer available — please remove it.';
  if (line.available === 0) return `Sold out at ${line.storeName}.`;
  if (line.quantity > line.available) return `Only ${line.available} left at ${line.storeName}.`;
  return null;
}

export default function CartView({ cart, signedIn }: { cart: Cart; signedIn: boolean }) {
  const router = useRouter();
  // One idempotency key per visit: a double-click or retried request can never create a second order.
  const [checkoutKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState<number | 'checkout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (lineId: number, request: () => Promise<unknown>) => {
    setPending(lineId);
    setError(null);
    try {
      await request();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const checkout = async () => {
    setPending('checkout');
    setError(null);
    try {
      await api<{ orderIds: number[] }>('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': checkoutKey } });
      router.push('/account?placed=1');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(null);
    }
  };

  if (cart.items.length === 0) {
    return (
      <p className="muted" style={{ textAlign: 'center' }}>
        Your bag is currently empty. <Link href="/store" className="text-link">Continue shopping</Link>
      </p>
    );
  }

  const blocked = cart.items.some((line) => lineProblem(line) !== null);

  return (
    <div className="cart-shell">
      {cart.items.map((line) => {
        const problem = lineProblem(line);
        const maxQuantity = Math.max(line.quantity, Math.min(MAX_LINE_QUANTITY, line.available));
        return (
          <div key={line.id} className="cart-line">
            <div className="cart-line-info">
              <Link href={`/store/${line.productId}`} className="cart-thumb">
                <ProductImage src={line.imageUrl} alt={line.name} sizes="60px" />
              </Link>
              <div>
                <h3>{line.name}</h3>
                <p>Store: {line.storeName}</p>
                <p>Size: {line.size}</p>
                {problem && <p className="line-warning">{problem}</p>}
              </div>
            </div>
            <div className="cart-line-actions">
              <select
                className="qty-select"
                aria-label={`Quantity for ${line.name}`}
                value={line.quantity}
                disabled={pending !== null}
                onChange={(e) =>
                  mutate(line.id, () => api(`/api/cart/items/${line.id}`, { method: 'PATCH', body: { quantity: Number(e.target.value) } }))
                }
              >
                {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>{formatPrice(line.price * line.quantity)}</span>
              <button
                className="link-button"
                disabled={pending !== null}
                onClick={() => mutate(line.id, () => api(`/api/cart/items/${line.id}`, { method: 'DELETE' }))}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}

      <div className="cart-total">
        Total: <strong>{formatPrice(cart.subtotal)}</strong>
      </div>

      {error && <p className="alert error" style={{ marginBottom: '1rem' }} role="alert">{error}</p>}

      {signedIn ? (
        <button className="btn block" onClick={checkout} disabled={pending !== null || blocked}>
          {pending === 'checkout' ? 'Placing Order...' : 'Proceed to Checkout'}
        </button>
      ) : (
        <Link href="/login?next=/cart" className="btn block" style={{ textAlign: 'center' }}>
          Sign In to Checkout
        </Link>
      )}
    </div>
  );
}
