import type { Metadata } from 'next';
import ProductCard from '@/components/ProductCard';
import ProductGrid from '@/components/ProductGrid';
import { listProducts } from '@/server/services/catalog';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? '';
  const results = query ? await listProducts({ q: query, pageSize: 48 }) : null;

  return (
    <main className="container section page">
      <div className="search-shell">
        <div style={{ marginBottom: '2rem' }}>
          <p className="eyebrow">Search</p>
          <h1 className="section-title left">Search</h1>
          <form action="/search" method="get" className="search-form" role="search">
            <input name="q" defaultValue={query} placeholder="Search products" aria-label="Search" />
            <button type="submit" className="btn">Search</button>
          </form>
        </div>

        {results && results.total === 0 && <p className="muted">No products matched “{query}”.</p>}
        {results && results.total > 0 && (
          <p className="muted small" style={{ marginBottom: '1.5rem' }}>
            {results.total} result{results.total === 1 ? '' : 's'} for “{query}”
          </p>
        )}

        {results && results.items.length > 0 && (
          <ProductGrid>
            {results.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ProductGrid>
        )}
      </div>
    </main>
  );
}
