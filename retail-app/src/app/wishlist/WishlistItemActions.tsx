'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ONE_SIZE } from '@/lib/constants';
import type { WishlistItem } from '@/lib/types';

export default function WishlistItemActions({ item }: { item: WishlistItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const run = async (request: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await request();
      if (success) setMessage({ kind: 'success', text: success });
      router.refresh();
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  // Sized items need a size choice, so they go to the product page; one-size items can be bagged directly.
  const canQuickAdd = !item.hasSizes && item.defaultStoreId !== null;

  return (
    <>
      <div className="account-actions">
        {item.totalStock === 0 ? (
          <button className="btn" disabled>Out of Stock</button>
        ) : canQuickAdd ? (
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(
                () => api('/api/cart/items', { method: 'POST', body: { productId: item.id, storeId: item.defaultStoreId, size: ONE_SIZE } }),
                'Added to your bag.'
              )
            }
          >
            Add to Bag
          </button>
        ) : (
          <Link href={`/store/${item.id}`} className="btn">Select Size</Link>
        )}
        <button className="btn outline" disabled={busy} onClick={() => run(() => api(`/api/wishlist/${item.id}`, { method: 'DELETE' }))}>
          Remove
        </button>
      </div>
      {message && <p className={`action-message alert ${message.kind}`}>{message.text}</p>}
    </>
  );
}
