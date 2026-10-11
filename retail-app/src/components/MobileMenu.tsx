'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Category } from '@/lib/types';
import ThemeToggle from './ThemeToggle';

/** Slide-in navigation drawer for small screens, where the hover dropdowns are unusable. */
export default function MobileMenu({ categories, signedIn }: { categories: Category[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Close whenever navigation completes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button className="icon-btn menu-toggle" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 7h18"/><path d="M3 12h18"/><path d="M3 17h18"/></svg>
      </button>

      <div className={`drawer-backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav className={`drawer${open ? ' open' : ''}`} aria-label="Main menu" aria-hidden={!open} inert={!open}>
        <div className="drawer-header">
          <span className="nav-brand">LUCID</span>
          <button className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
          </button>
        </div>

        <ul className="drawer-list">
          {categories.map((category) => {
            const isOpen = expanded === category.slug;
            return (
              <li key={category.slug}>
                <button
                  className="drawer-category"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : category.slug)}
                >
                  {category.name}
                  <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <ul className="drawer-sublist">
                    <li><Link href={`/store?category=${category.slug}`}>Shop All {category.name}</Link></li>
                    {category.subcategories.map((sub) => (
                      <li key={sub.slug}>
                        <Link href={`/store?category=${category.slug}&sub=${sub.slug}`}>{sub.name}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <ul className="drawer-secondary">
          <li><Link href={signedIn ? '/account' : '/login'}>{signedIn ? 'My Account' : 'Sign In'}</Link></li>
          <li><Link href="/wishlist">Wishlist</Link></li>
          <li><Link href="/cart">Shopping Bag</Link></li>
          <li><Link href="/search">Search</Link></li>
          <li><Link href="/size-chart">Size Guide</Link></li>
          <li className="drawer-theme">Theme <ThemeToggle /></li>
        </ul>
      </nav>
    </>
  );
}
