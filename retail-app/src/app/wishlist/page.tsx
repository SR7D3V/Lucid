import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ProductImage from '@/components/ProductImage';
import { formatPrice } from '@/lib/format';
import { getCurrentUser } from '@/server/session';
import { listWishlist } from '@/server/services/wishlist';
import WishlistItemActions from './WishlistItemActions';

export const metadata: Metadata = { title: 'Wishlist' };

export default async function WishlistPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/wishlist');

  const items = await listWishlist(user.id);

  return (
    <main className="container section page">
      <div className="search-shell">
        <p className="eyebrow">Wishlist</p>
        <h1 className="section-title left">Saved For Later</h1>

        {items.length === 0 && (
          <p className="muted">
            Your wishlist is empty. <Link href="/store" className="text-link">Continue shopping</Link>
          </p>
        )}

        <div className="wishlist-grid">
          {items.map((item) => (
            <article key={item.id} className="wishlist-card">
              <Link href={`/store/${item.id}`} className="thumb">
                <ProductImage src={item.imageUrl} alt={item.name} sizes="160px" />
              </Link>
              <div>
                <h2>{item.name}</h2>
                <p className="muted">{item.description}</p>
                <p style={{ margin: '0.75rem 0 1rem' }}>{formatPrice(item.price)}</p>
                <WishlistItemActions item={item} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
