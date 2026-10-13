import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import AuthShell from '@/components/AuthShell';
import { safeNextPath } from '@/lib/redirect';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Sign In' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthShell>
      <AuthForm next={next} />
    </AuthShell>
  );
}
