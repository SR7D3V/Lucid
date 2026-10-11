import Link from 'next/link';
import { listCategories } from '@/server/services/catalog';
import { listStores } from '@/server/services/stores';

export default async function Footer() {
  const [categories, stores] = await Promise.all([listCategories(), listStores()]);

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link href="/" className="nav-brand">LUCID</Link>
        </div>
        <div>
          <h2 className="footer-heading">Shop</h2>
          <ul className="footer-links">
            {categories.map((category) => (
              <li key={category.slug}><Link href={`/store?category=${category.slug}`}>{category.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="footer-heading">Help</h2>
          <ul className="footer-links">
            <li><Link href="/account">My Account</Link></li>
            <li><Link href="/wishlist">Wishlist</Link></li>
            <li><Link href="/cart">Shopping Bag</Link></li>
            <li><Link href="/size-chart">Size Guide</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="footer-heading">Our Stores</h2>
          <ul className="footer-links">
            {stores.map((store) => (
              <li key={store.id} className="muted">{store.name}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="container">
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} LUCID Clothing</span>
          <Link href="/search">Search</Link>
        </div>
      </div>
    </footer>
  );
}
