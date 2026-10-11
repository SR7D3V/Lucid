import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import ProductGrid from '@/components/ProductGrid';
import { listTrendingProducts } from '@/server/services/catalog';

export default async function LandingPage() {
  const products = await listTrendingProducts(12);

  return (
    <main>
      <div className="hero-video-container">
        <video autoPlay loop muted playsInline preload="metadata">
          <source src="/hero-background.mp4" type="video/mp4" />
        </video>
        <div className="hero-video-overlay">
          <h1>New Arrivals</h1>
          <Link href="/store" className="btn">Shop Now</Link>
        </div>
      </div>

      <div className="container">
        <h2 className="section-title">Trending Now</h2>
        {products.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center', marginBottom: '4rem' }}>No products available.</p>
        ) : (
          <ProductGrid>
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </ProductGrid>
        )}
      </div>
    </main>
  );
}
