'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/auth/password-reset/request', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-box">
      <h2>Reset Password</h2>
      {sent ? (
        <div className="auth-message">
          <p>If an account exists for <strong>{email}</strong>, you&apos;ll receive an email with a link to reset your password.</p>
          <p className="muted small">The link expires in 30 minutes. Check your spam folder if it doesn&apos;t arrive.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <p className="muted small">Enter the email address for your account and we&apos;ll send you a reset link.</p>
          <input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <p className="alert error" role="alert">{error}</p>}
          <button type="submit" className="btn block" disabled={submitting}>
            {submitting ? 'Please wait...' : 'Send Reset Link'}
          </button>
        </form>
      )}
      <Link href="/login" className="auth-switch">Back to Login</Link>
    </div>
  );
}
