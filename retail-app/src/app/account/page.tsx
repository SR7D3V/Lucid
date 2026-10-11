import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ProductImage from '@/components/ProductImage';
import { capitalize, formatDateTime, formatPrice } from '@/lib/format';
import { getCurrentUser } from '@/server/session';
import { listCustomerOrders } from '@/server/services/orders';
import { CancelOrderButton, LogoutButton, ProfileDetails } from './AccountActions';

export const metadata: Metadata = { title: 'My Account' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account');

  const [orders, { placed }] = await Promise.all([listCustomerOrders(user.id), searchParams]);

  return (
    <main className="container section page">
      <div className="account-shell">
        <section className="account-panel">
          <p className="eyebrow">My Account</p>
          <h1 className="section-title left">{user.name}</h1>
          <ProfileDetails customer={user} />
          <div className="account-actions">
            <Link href="/wishlist" className="btn">Wishlist</Link>
            {user.role === 'admin' && <Link href="/admin" className="btn">Admin</Link>}
            <LogoutButton />
          </div>
        </section>

        <section className="account-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <p className="eyebrow">Order History</p>
              <h2 className="serif-heading">Previous Orders</h2>
            </div>
            <Link href="/store" className="text-link">Continue Shopping</Link>
          </div>

          {placed && <p className="alert success" style={{ marginTop: '1rem' }}>Thank you — your order has been placed.</p>}

          {orders.length === 0 ? (
            <p className="muted" style={{ marginTop: '1.5rem' }}>You haven&apos;t placed any orders yet.</p>
          ) : (
            <div className="order-stack">
              {orders.map((order) => (
                <article key={order.id} className="order-card">
                  <div className="order-header">
                    <div>
                      <p className="detail-label">Order #{order.id}</p>
                      <p>{formatDateTime(order.placedAt)}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p><span className="status-pill">{capitalize(order.status)}</span></p>
                      <p>{formatPrice(order.totalAmount)}</p>
                    </div>
                  </div>
                  <p className="muted" style={{ marginBottom: '1rem' }}>
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) from {order.storeName}
                  </p>
                  <div className="order-items">
                    {order.items.map((item) => (
                      <div key={`${item.productId}-${item.size}`} className="order-item-row">
                        <Link href={`/store/${item.productId}`} className="thumb">
                          <ProductImage src={item.imageUrl} alt={item.name} sizes="88px" />
                        </Link>
                        <div>
                          <h3>{item.name}</h3>
                          <p>Quantity: {item.quantity}</p>
                          <p>Size: {item.size}</p>
                          <p>Unit price: {formatPrice(item.unitPrice)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {order.status === 'confirmed' && <CancelOrderButton orderId={order.id} />}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
