'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ONE_SIZE, SIZES } from '@/lib/constants';
import type { ProductDetail } from '@/lib/types';

type Message = { kind: 'success' | 'error'; text: string } | null;

export default function ProductActions({
  product,
  signedIn,
  initiallyWishlisted,
}: {
  product: ProductDetail;
  signedIn: boolean;
  initiallyWishlisted: boolean;
}) {
  const router = useRouter();
  const inStockStores = product.stores.filter((store) => store.quantity > 0);
  const [storeId, setStoreId] = useState<number | null>(product.defaultStoreId ?? inStockStores[0]?.storeId ?? null);
  const [size, setSize] = useState<string>(product.hasSizes ? '' : ONE_SIZE);
  const [wishlisted, setWishlisted] = useState(initiallyWishlisted);
  const [busy, setBusy] = useState<'bag' | 'wishlist' | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const store = product.stores.find((s) => s.storeId === storeId) ?? null;

  const addToBag = async () => {
    if (!store || store.quantity <= 0) return setMessage({ kind: 'error', text: 'Choose a store that has this item in stock.' });
    if (!size) return setMessage({ kind: 'error', text: 'Please select a size.' });

    setBusy('bag');
    setMessage(null);
    try {
      await api('/api/cart/items', { method: 'POST', body: { productId: product.id, storeId: store.storeId, size, quantity: 1 } });
      setMessage({ kind: 'success', text: `Added to your bag from ${store.name}.` });
      router.refresh();
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const toggleWishlist = async () => {
    if (!signedIn) return router.push(`/login?next=/store/${product.id}`);

    setBusy('wishlist');
    setMessage(null);
    try {
      await api(`/api/wishlist/${product.id}`, { method: wishlisted ? 'DELETE' : 'PUT' });
      setWishlisted(!wishlisted);
      router.refresh();
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="option-group">
        <label htmlFor="product-store" className="field-label" style={{ marginBottom: '0.5rem' }}>Store Inventory</label>
        {product.stores.length === 0 ? (
          <div className="static-option">Currently unavailable in all stores</div>
        ) : (
          <select id="product-store" className="input" value={storeId ?? ''} onChange={(e) => setStoreId(Number(e.target.value))}>
            {product.stores.map((s) => (
              <option key={s.storeId} value={s.storeId} disabled={s.quantity <= 0}>
                {s.name} ({s.location}) - {s.quantity > 0 ? `${s.quantity} in stock` : 'Out of stock'}
              </option>
            ))}
          </select>
        )}
        {store && store.quantity > 0 && (
          <p className="muted small" style={{ marginTop: '0.75rem' }}>Ships from {store.name}.</p>
        )}
      </div>

      <div className="option-group">
        <div className="option-header">
          <span className="field-label">{product.hasSizes ? 'Select Size' : 'Size'}</span>
          {product.hasSizes && <Link href="/size-chart" className="muted small text-link">Size Chart</Link>}
        </div>
        {product.hasSizes ? (
          <div className="size-options" role="radiogroup" aria-label="Size">
            {SIZES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={size === option}
                className={`size-option${size === option ? ' active' : ''}`}
                onClick={() => setSize(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="static-option">{ONE_SIZE}</div>
        )}
      </div>

      <div className="product-actions">
        <button className="btn" onClick={addToBag} disabled={busy !== null || inStockStores.length === 0}>
          {inStockStores.length === 0 ? 'Out of Stock' : busy === 'bag' ? 'Adding...' : 'Add to Bag'}
        </button>
        <button className="btn outline" onClick={toggleWishlist} type="button" disabled={busy !== null}>
          {wishlisted ? 'Remove Wishlist' : 'Add to Wishlist'}
        </button>
      </div>
      {message && (
        <p className={`action-message alert ${message.kind}`} role="status">
          {message.text}{' '}
          {message.kind === 'success' && <Link href="/cart" className="text-link">View bag</Link>}
        </p>
      )}
    </>
  );
}
