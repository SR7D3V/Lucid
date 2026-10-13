'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) return setError('Passwords do not match.');

    setError(null);
    setSubmitting(true);
    try {
      await api('/api/auth/password-reset/confirm', { method: 'POST', body: { token, password } });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="auth-box">
        <h2>Password Updated</h2>
        <p className="auth-message">Your password has been changed and you&apos;ve been signed out on all devices.</p>
        <Link href="/login" className="btn block">Sign In</Link>
      </div>
    );
  }

  const expired = error?.includes('expired');

  return (
    <div className="auth-box">
      <h2>New Password</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="password"
          placeholder="New password (min. 8 characters)"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {error && <p className="alert error" role="alert">{error}</p>}
        <button type="submit" className="btn block" disabled={submitting}>
          {submitting ? 'Please wait...' : 'Update Password'}
        </button>
      </form>
      {expired && <Link href="/forgot-password" className="auth-switch">Request a new link</Link>}
    </div>
  );
}
