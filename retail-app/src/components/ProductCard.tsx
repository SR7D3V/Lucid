import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';
import ProductImage from './ProductImage';

export default function ProductCard({ product, priority }: { product: ProductSummary; priority?: boolean }) {
  return (
    <Link href={`/store/${product.id}`} className="product-card">
      <div className="product-image">
        <ProductImage src={product.imageUrl} alt={product.name} sizes="(max-width: 700px) 100vw, (max-width: 1200px) 33vw, 25vw" priority={priority} />
      </div>
      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="product-price">{formatPrice(product.price)}</div>
      </div>
    </Link>
  );
}
