'use client';

import { Children, isValidElement, useLayoutEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';

/** Product grid that staggers its cards in on mount. */
export default function ProductGrid({ children }: { children: ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);
  // Animate only when the set of products changes, not on every re-render or router.refresh().
  const itemKeys = Children.toArray(children)
    .map((child) => (isValidElement(child) ? child.key : ''))
    .join('|');

  useLayoutEffect(() => {
    if (!gridRef.current?.children.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const tween = gsap.fromTo(
      gridRef.current.children,
      { opacity: 0, y: 50 },
      { opacity: 1, y: 0, stagger: 0.1, duration: 1, ease: 'power3.out' }
    );
    return () => {
      tween.kill();
    };
  }, [itemKeys]);

  return (
    <div className="product-grid" ref={gridRef}>
      {children}
    </div>
  );
}
