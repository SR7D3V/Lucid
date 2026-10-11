import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { formatDateTime, formatPrice } from '@/lib/format';
import { getCurrentUser } from '@/server/session';
import { getOverview, getSchemaReference, listProductOptions } from '@/server/services/admin';
import { listCategories } from '@/server/services/catalog';
import { listLowStock, listRecentMovements } from '@/server/services/inventory';
import { listAllOrders } from '@/server/services/orders';
import { listStores } from '@/server/services/stores';
import { OrdersPanel, ProductForm, StockForm, StoreForm } from './ManagementPanels';
import SqlConsole from './SqlConsole';

export const metadata: Metadata = { title: 'Admin', robots: { index: false } };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'admin') notFound();

  const [overview, lowStock, movements, orders, stores, products, categories, schema] = await Promise.all([
    getOverview(),
    listLowStock(),
    listRecentMovements(),
    listAllOrders({ limit: 25 }),
    listStores(),
    listProductOptions(),
    listCategories(),
    getSchemaReference(),
  ]);

  const kpis = [
    ['Revenue', formatPrice(overview.revenue)],
    ['Orders', overview.orders],
    ['Awaiting Shipment', overview.openOrders],
    ['Customers', overview.customers],
    ['Active Products', overview.products],
    ['Low Stock Lines', overview.lowStock],
  ] as const;

  return (
    <div className="admin-shell">
      <h1 className="section-title" style={{ marginBottom: 0 }}>Admin Store Manager</h1>

      <div className="kpi-grid">
        {kpis.map(([label, value]) => (
          <div key={label} className="kpi">
            <span className="detail-label">{label}</span>
            <div className="kpi-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="panel-grid wide-left">
        <OrdersPanel orders={orders} />
        <div className="panel">
          <h2 className="panel-title">Low Stock</h2>
          {lowStock.length === 0 ? (
            <p className="muted small">No low-stock items.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Store</th><th>Units</th></tr></thead>
                <tbody>
                  {lowStock.map((row) => (
                    <tr key={`${row.storeId}-${row.productId}`}>
                      <td>{row.productName}</td><td>{row.storeName}</td><td>{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="panel-title" style={{ marginTop: '2rem' }}>Stock Movements</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>When</th><th>Product</th><th>Store</th><th>Change</th><th>Reason</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.createdAt)}</td>
                    <td>{m.productName}</td>
                    <td>{m.storeName}</td>
                    <td>{m.delta > 0 ? `+${m.delta}` : m.delta} → {m.quantityAfter}</td>
                    <td>{m.reason}{m.orderId ? ` #${m.orderId}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <StockForm stores={stores} products={products} />
        <StoreForm />
        <ProductForm stores={stores} categories={categories} />
      </div>

      <SqlConsole schema={schema} />
    </div>
  );
}
