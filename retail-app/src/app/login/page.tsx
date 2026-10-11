import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { safeNextPath } from '@/lib/redirect';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Sign In' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <main className="auth-split">
      <div className="auth-visual" aria-hidden="true">
        <video autoPlay loop muted playsInline preload="metadata">
          <source src="/hero-background.mp4" type="video/mp4" />
        </video>
        <span className="auth-wordmark">LUCID</span>
      </div>
      <div className="auth-panel">
        <AuthForm next={next} />
      </div>
    </main>
  );
}
