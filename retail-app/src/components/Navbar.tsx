import Link from 'next/link';
import { getCartId, getCurrentUser } from '@/server/session';
import { countCartItems } from '@/server/services/cart';
import { listCategories } from '@/server/services/catalog';
import { countWishlist } from '@/server/services/wishlist';
import { Suspense } from 'react';
import MobileMenu from './MobileMenu';
import ThemeToggle from './ThemeToggle';

export default async function Navbar() {
  const [categories, user, cartId] = await Promise.all([listCategories(), getCurrentUser(), getCartId()]);
  const [cartCount, wishlistCount] = await Promise.all([
    countCartItems(cartId),
    user ? countWishlist(user.id) : 0,
  ]);

  return (
    <>
      <Link href="/store" className="top-banner">
        BREEZY LINEN STYLES FOR WARM SUMMER DAYS &rarr;
      </Link>
      <nav className="navbar">
        <div className="nav-left">
          <Suspense>
            <MobileMenu categories={categories} signedIn={Boolean(user)} />
          </Suspense>
          <Link href="/" className="nav-brand">LUCID</Link>
        </div>
        <div className="nav-center">
          {categories.map((category) => (
            <div className="nav-item-wrapper" key={category.slug}>
              <Link href={`/store?category=${category.slug}`} className="nav-link-main">{category.name}</Link>
              <div className="dropdown-menu">
                {category.subcategories.map((sub) => (
                  <Link href={`/store?category=${category.slug}&sub=${sub.slug}`} key={sub.slug} className="dropdown-item">
                    {sub.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="nav-right">
          <ThemeToggle />
          <Link href="/search" className="icon-btn" data-title="Search" aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </Link>
          <Link href={user ? '/account' : '/login'} className="icon-btn" data-title={user ? user.name : 'Account'} aria-label="Account">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </Link>
          <Link href="/wishlist" className="icon-btn" data-title="Wishlist" aria-label="Wishlist">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            {wishlistCount > 0 && <span className="icon-badge">{wishlistCount}</span>}
          </Link>
          <Link href="/cart" className="icon-btn" data-title="Shopping Bag" aria-label="Shopping bag">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            {cartCount > 0 && <span className="icon-badge">{cartCount}</span>}
          </Link>
        </div>
      </nav>
    </>
  );
}
