import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductImage from '@/components/ProductImage';
import { formatPrice } from '@/lib/format';
import { getCurrentUser } from '@/server/session';
import { getProduct } from '@/server/services/catalog';
import { isWishlisted } from '@/server/services/wishlist';
import ProductActions from './ProductActions';

type Props = { params: Promise<{ id: string }> };

async function loadProduct(params: Props['params']) {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? getProduct(id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await loadProduct(params);
  return product ? { title: product.name, description: product.description ?? undefined } : { title: 'Not found' };
}

export default async function ProductPage({ params }: Props) {
  const product = await loadProduct(params);
  if (!product) notFound();

  const user = await getCurrentUser();
  const wishlisted = user ? await isWishlisted(user.id, product.id) : false;

  return (
    <main className="container section product-detail">
      <div className="product-detail-image">
        <ProductImage src={product.imageUrl} alt={product.name} sizes="(max-width: 700px) 100vw, 50vw" priority />
      </div>
      <div className="product-detail-info">
        <p className="eyebrow">{product.categoryName} · {product.subcategoryName}</p>
        <h1>{product.name}</h1>
        <p className="product-detail-price">{formatPrice(product.price)}</p>
        {product.description && <p className="product-detail-description">{product.description}</p>}
        <ProductActions product={product} signedIn={Boolean(user)} initiallyWishlisted={wishlisted} />
      </div>
    </main>
  );
}
