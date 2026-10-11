import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import ProductGrid from '@/components/ProductGrid';
import { PRODUCT_SORTS } from '@/lib/constants';
import { listCategories, listProducts } from '@/server/services/catalog';
import { productQuerySchema } from '@/server/validation';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Parses each filter independently, so one malformed parameter doesn't discard the others. */
async function readFilters(searchParams: Props['searchParams']) {
  const raw = await searchParams;
  const first = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const fields = productQuerySchema.shape;
  return {
    category: fields.category.safeParse(first('category')).data,
    sub: fields.sub.safeParse(first('sub')).data,
    sort: fields.sort.safeParse(first('sort')).data,
    page: fields.page.safeParse(first('page')).data ?? 1,
  };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { category } = await readFilters(searchParams);
  const match = category ? (await listCategories()).find((c) => c.slug === category) : undefined;
  return { title: match?.name ?? 'New Arrivals' };
}

export default async function StorePage({ searchParams }: Props) {
  const filters = await readFilters(searchParams);
  const [categories, result] = await Promise.all([
    listCategories(),
    listProducts({ ...filters, subcategory: filters.sub }),
  ]);

  // Past the last page (e.g. after products sell out): go to the last page that exists.
  if (result.items.length === 0 && result.total === 0 && filters.page > 1) {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.sub) params.set('sub', filters.sub);
    if (filters.sort) params.set('sort', filters.sort);
    redirect(params.size ? `/store?${params}` : '/store');
  }

  const category = categories.find((c) => c.slug === filters.category);
  const subcategory = category?.subcategories.find((s) => s.slug === filters.sub);
  const title = subcategory ? `${category!.name} · ${subcategory.name}` : category?.name ?? 'New Arrivals';

  const href = (changes: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { category: filters.category, sub: filters.sub, sort: filters.sort, page: undefined, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '' && !(key === 'page' && Number(value) === 1)) params.set(key, String(value));
    }
    const query = params.toString();
    return query ? `/store?${query}` : '/store';
  };
  const activeSort = filters.sort ?? 'newest';

  return (
    <main className="container section page">
      <h1 className="section-title">{title}</h1>

      <div className="filter-bar">
        <div className="filter-links">
          {category && (
            <>
              <Link href={href({ sub: undefined })} className={!filters.sub ? 'active' : ''}>All</Link>
              {category.subcategories.map((sub) => (
                <Link key={sub.slug} href={href({ sub: sub.slug })} className={filters.sub === sub.slug ? 'active' : ''}>
                  {sub.name}
                </Link>
              ))}
            </>
          )}
        </div>
        <div className="filter-links">
          {Object.entries(PRODUCT_SORTS).map(([value, label]) => (
            <Link key={value} href={href({ sort: value === 'newest' ? undefined : value })} className={activeSort === value ? 'active' : ''}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {result.items.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center' }}>No products found.</p>
      ) : (
        <ProductGrid>
          {result.items.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </ProductGrid>
      )}

      {result.pageCount > 1 && (
        <nav className="pager" aria-label="Pagination">
          {result.page > 1 ? <Link href={href({ page: result.page - 1 })}>&larr; Previous</Link> : <span className="disabled">&larr; Previous</span>}
          <span className="muted">Page {result.page} of {result.pageCount}</span>
          {result.page < result.pageCount ? <Link href={href({ page: result.page + 1 })}>Next &rarr;</Link> : <span className="disabled">Next &rarr;</span>}
        </nav>
      )}
    </main>
  );
}
