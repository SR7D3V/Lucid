'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { Customer } from '@/lib/types';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.push('/');
        router.refresh();
      }}
    >
      Log Out
    </button>
  );
}

export function ProfileDetails({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="account-detail-list">
        <div>
          <span className="detail-label">Email</span>
          <p>{customer.email}</p>
        </div>
        <div>
          <span className="detail-label">Phone</span>
          <p>{customer.phone || 'Not added yet'}</p>
        </div>
        <button className="link-button" style={{ justifySelf: 'start' }} onClick={() => setEditing(true)}>
          Edit details
        </button>
      </div>
    );
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/account', { method: 'PATCH', body: { name, phone } });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-grid" onSubmit={save}>
      <div className="field">
        <label htmlFor="profile-name" className="field-label">Name</label>
        <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="profile-phone" className="field-label">Phone</label>
        <input id="profile-phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
      </div>
      {error && <p className="alert error">{error}</p>}
      <div className="account-actions" style={{ marginTop: 0 }}>
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        <button className="btn outline" type="button" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function CancelOrderButton({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    if (!window.confirm(`Cancel order #${orderId}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${orderId}/cancel`, { method: 'POST' });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <button className="link-button" onClick={cancel} disabled={busy}>
        {busy ? 'Cancelling...' : 'Cancel order'}
      </button>
      {error && <p className="alert error" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
