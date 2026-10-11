import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container section page" style={{ textAlign: 'center' }}>
      <p className="eyebrow">404</p>
      <h1 className="section-title">Page Not Found</h1>
      <p className="muted" style={{ marginBottom: '2rem' }}>The page you are looking for has moved or no longer exists.</p>
      <Link href="/store" className="btn">Continue Shopping</Link>
    </main>
  );
}
