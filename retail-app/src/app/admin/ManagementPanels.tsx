'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorMessage } from '@/lib/api';
import { ORDER_TRANSITIONS } from '@/lib/constants';
import { capitalize, formatDateTime, formatPrice } from '@/lib/format';
import type { AdminOrder, Category, ProductOption, Store } from '@/lib/types';

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/** Submit/feedback plumbing shared by the admin forms. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback({ kind: 'success', text: await work() });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({ kind: 'error', text: errorMessage(error) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const message = feedback && <div className={`alert ${feedback.kind}`}>{feedback.text}</div>;
  return { busy, run, message };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
    </div>
  );
}

export function OrdersPanel({ orders }: { orders: AdminOrder[] }) {
  const { busy, run, message } = useAction();

  const changeStatus = (order: AdminOrder, status: string) =>
    run(async () => {
      await api(`/api/admin/orders/${order.id}`, { method: 'PATCH', body: { status } });
      return `Order #${order.id} marked ${status}.`;
    });

  return (
    <div className="panel">
      <h2 className="panel-title">Recent Orders</h2>
      {message && <div style={{ marginBottom: '1rem' }}>{message}</div>}
      {orders.length === 0 ? (
        <p className="muted small">No orders yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Placed</th><th>Customer</th><th>Store</th><th>Items</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const next = ORDER_TRANSITIONS[order.status];
                return (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{formatDateTime(order.placedAt)}</td>
                    <td title={order.customerEmail}>{order.customerName}</td>
                    <td>{order.storeName}</td>
                    <td>{order.itemCount}</td>
                    <td>{formatPrice(order.totalAmount)}</td>
                    <td>
                      {next.length === 0 ? (
                        capitalize(order.status)
                      ) : (
                        <select
                          className="qty-select"
                          aria-label={`Status for order ${order.id}`}
                          value={order.status}
                          disabled={busy}
                          onChange={(e) => changeStatus(order, e.target.value)}
                        >
                          {[order.status, ...next].map((status) => (
                            <option key={status} value={status}>{capitalize(status)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function StockForm({ stores, products }: { stores: Store[]; products: ProductOption[] }) {
  const { busy, run, message } = useAction();
  const [storeId, setStoreId] = useState(String(stores[0]?.id ?? ''));
  const [productId, setProductId] = useState(String(products[0]?.id ?? ''));
  const [quantity, setQuantity] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      const result = await api<{ quantity: number; previous: number }>('/api/admin/inventory', {
        method: 'PUT',
        body: { storeId: Number(storeId), productId: Number(productId), quantity: Number(quantity) },
      });
      setQuantity('');
      return `Stock updated from ${result.previous} to ${result.quantity}.`;
    });
  };

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <h2 className="panel-title">Set Stock Level</h2>
      <Field id="stock-product" label="Product">
        <select id="stock-product" className="input" value={productId} onChange={(e) => setProductId(e.target.value)} required>
          {products.map((p) => (
            <option key={p.id} value={p.id}>#{p.id} {p.name}{p.isActive ? '' : ' (archived)'}</option>
          ))}
        </select>
      </Field>
      <div className="form-row">
        <Field id="stock-store" label="Store">
          <select id="stock-store" className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)} required>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field id="stock-quantity" label="Units on Hand">
          <input id="stock-quantity" className="input" type="number" min="0" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="25" />
        </Field>
      </div>
      {message}
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Update Stock'}</button>
    </form>
  );
}

export function StoreForm() {
  const { busy, run, message } = useAction();
  const [form, setForm] = useState({ name: '', location: '', contact: '' });
  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: e.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      const { store } = await api<{ store: Store }>('/api/stores', { method: 'POST', body: form });
      setForm({ name: '', location: '', contact: '' });
      return `Store added with ID ${store.id}.`;
    });
  };

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <h2 className="panel-title">Add New Store</h2>
      <Field id="store-name" label="Store Name">
        <input id="store-name" className="input" value={form.name} onChange={update('name')} required maxLength={120} placeholder="Lucid Mumbai" />
      </Field>
      <div className="form-row">
        <Field id="store-location" label="Location">
          <input id="store-location" className="input" value={form.location} onChange={update('location')} required maxLength={120} placeholder="Mumbai" />
        </Field>
        <Field id="store-contact" label="Contact">
          <input id="store-contact" className="input" value={form.contact} onChange={update('contact')} maxLength={40} placeholder="9876543210" />
        </Field>
      </div>
      {message}
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Adding Store...' : 'Add Store'}</button>
    </form>
  );
}

export function ProductForm({ stores, categories }: { stores: Store[]; categories: Category[] }) {
  const { busy, run, message } = useAction();
  const [category, setCategory] = useState(categories[0]?.slug ?? '');
  const subcategories = categories.find((c) => c.slug === category)?.subcategories ?? [];
  const [subcategory, setSubcategory] = useState(subcategories[0]?.slug ?? '');
  const [previewUrl, setPreviewUrl] = useState('');
  const [formKey, setFormKey] = useState(0);

  // Release each object URL once it is replaced or the form unmounts.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(async () => {
      const { product } = await api<{ product: { id: number } }>('/api/products', { method: 'POST', body: form });
      setPreviewUrl('');
      setFormKey((key) => key + 1);
      return `Product added with ID ${product.id}.`;
    });
  };

  return (
    <form key={formKey} className="panel form-grid" onSubmit={submit}>
      <h2 className="panel-title">Add New Product</h2>
      <Field id="product-name" label="Product Name">
        <input id="product-name" name="name" className="input" required maxLength={200} placeholder="Classic Linen Top" />
      </Field>
      <div className="form-row">
        <Field id="product-category" label="Category">
          <select
            id="product-category"
            name="category"
            className="input"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSubcategory(categories.find((c) => c.slug === e.target.value)?.subcategories[0]?.slug ?? '');
            }}
          >
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </Field>
        <Field id="product-subcategory" label="Section">
          <select id="product-subcategory" name="subcategory" className="input" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
            {subcategories.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field id="product-description" label="Description">
        <textarea id="product-description" name="description" className="input" rows={3} maxLength={2000} placeholder="Soft linen-blend top with a relaxed fit." />
      </Field>
      <div className="form-row">
        <Field id="product-price" label="Price (₹)">
          <input id="product-price" name="price" className="input" type="number" min="1" step="0.01" required placeholder="1999" />
        </Field>
        <Field id="product-quantity" label="Initial Stock">
          <input id="product-quantity" name="quantity" className="input" type="number" min="0" step="1" required placeholder="25" />
        </Field>
      </div>
      <Field id="product-store" label="Store">
        <select id="product-store" name="storeId" className="input" required defaultValue={stores[0]?.id}>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.location})</option>)}
        </select>
      </Field>
      <Field id="product-image" label="Product Image">
        <input
          id="product-image"
          name="image"
          className="input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          required
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreviewUrl(file ? URL.createObjectURL(file) : '');
          }}
        />
      </Field>
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={previewUrl} alt="Preview" style={{ width: '100%', maxWidth: 240, aspectRatio: '3 / 4', objectFit: 'cover' }} />
      )}
      {message}
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Adding Product...' : 'Add Product'}</button>
    </form>
  );
}
