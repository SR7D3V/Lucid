import type { Metadata } from 'next';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import ResetPasswordForm from './ResetPasswordForm';

export const metadata: Metadata = { title: 'Choose a New Password', robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <AuthShell>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="auth-box">
          <h2>Link Not Valid</h2>
          <p className="auth-message muted">This reset link is incomplete. Please request a new one.</p>
          <Link href="/forgot-password" className="btn block">Request New Link</Link>
        </div>
      )}
    </AuthShell>
  );
}
