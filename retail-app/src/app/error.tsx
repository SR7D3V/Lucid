'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container section page" style={{ textAlign: 'center' }}>
      <p className="eyebrow">Error</p>
      <h1 className="section-title">Something Went Wrong</h1>
      <p className="muted" style={{ marginBottom: '2rem' }}>
        We could not load this page. Please try again in a moment.
        {error.digest && <><br />Reference: {error.digest}</>}
      </p>
      <button className="btn" onClick={reset}>Try Again</button>
    </main>
  );
}
