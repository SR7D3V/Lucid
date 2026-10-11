'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export default function AuthForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === 'login';

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        body: isLogin ? { email: form.email, password: form.password } : form,
      });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-box">
      <h2>{isLogin ? 'Login' : 'Register'}</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        {!isLogin && (
          <>
            <input type="text" placeholder="Name" autoComplete="name" value={form.name} onChange={update('name')} required />
            <input type="tel" placeholder="Phone (optional)" autoComplete="tel" value={form.phone} onChange={update('phone')} />
          </>
        )}
        <input type="email" placeholder="Email" autoComplete="email" value={form.email} onChange={update('email')} required />
        <input
          type="password"
          placeholder={isLogin ? 'Password' : 'Password (min. 8 characters)'}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          minLength={isLogin ? undefined : 8}
          value={form.password}
          onChange={update('password')}
          required
        />
        {error && <p className="alert error" role="alert">{error}</p>}
        <button type="submit" className="btn block" style={{ marginTop: '1rem' }} disabled={submitting}>
          {submitting ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up'}
        </button>
      </form>
      <button
        type="button"
        className="auth-switch"
        onClick={() => {
          setMode(isLogin ? 'register' : 'login');
          setError(null);
        }}
      >
        {isLogin ? 'Create an account' : 'Back to Login'}
      </button>
    </div>
  );
}
