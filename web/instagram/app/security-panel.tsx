'use client';
import { useState, useEffect } from 'react';
import { ShieldCheck, LockKeyhole, LogOut, KeyRound, Smartphone, Check, Key } from 'lucide-react';
import MobilePairing from './mobile-pairing';
import { toast } from 'sonner';

export default function SecurityPanel() {
  const [newPin, setNewPin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinError, setPinError] = useState('');
  const [hasPin, setHasPin] = useState(false);

  useEffect(() => {
    fetch('/api/auth')
      .then(res => res.json())
      .then((data: any) => {
        if (data?.hasPin) setHasPin(true);
      })
      .catch(() => {});
  }, []);

  async function handleSignOut() {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } catch {}
    window.location.href = '/login';
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    setPinError('');
    setPinSuccess(false);

    if (!newPin.trim() || newPin.trim().length < 4) {
      setPinError('PIN must be at least 4 digits or characters.');
      return;
    }

    setSavingPin(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-pin',
          newPin: newPin.trim(),
          currentPassword: currentPassword.trim() || undefined
        })
      });
      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update PIN');
      }
      setPinSuccess(true);
      setHasPin(true);
      setNewPin('');
      setCurrentPassword('');
      toast.success('Owner PIN updated successfully! You can now log in using this PIN.');
    } catch (err: any) {
      setPinError(err.message || 'Failed to update PIN');
      toast.error(err.message || 'Failed to update PIN');
    } finally {
      setSavingPin(false);
    }
  }

  return (
    <div className="security-layout">
      <section className="security-hero">
        <span className="security-symbol">
          <ShieldCheck size={34} />
        </span>
        <div>
          <div className="section-kicker">ONE OWNER. PRIVATE ACCESS.</div>
          <h2>Your workspace, protected.</h2>
          <p>
            Private owner credentials and device-isolated sessions. Only you as the verified owner can view, manage, and configure your Instagram data and connected keys.
          </p>
        </div>
        <button 
          type="button" 
          className="button" 
          onClick={handleSignOut}
          style={{ cursor: 'pointer', gap: '8px' }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </section>

      {/* DASHBOARD PIN MANAGEMENT SECTION */}
      <section className="settings-card" style={{ marginBottom: '20px' }}>
        <div className="settings-card-heading">
          <span className="card-icon">
            <Key size={19} />
          </span>
          <div>
            <h2>Owner Quick PIN Access</h2>
            <p>
              Set or update your owner PIN to quickly log into your dashboard from mobile or desktop without entering your full password.
            </p>
          </div>
        </div>

        <form onSubmit={handleSavePin} style={{ maxWidth: '440px', marginTop: '12px' }}>
          {pinError && (
            <div className="error-banner" style={{ marginBottom: '12px' }} role="alert">
              <span>{pinError}</span>
            </div>
          )}
          {pinSuccess && (
            <div style={{ background: '#edfcf2', border: '1px solid #c3f2d2', color: '#137333', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Check size={16} />
              <span>Owner PIN successfully saved! You can use it to log in.</span>
            </div>
          )}

          <label className="field">
            <span>New Owner PIN (4–12 digits or characters)</span>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="e.g. 123456 or secure PIN"
              maxLength={12}
              required
            />
            <small>Allows rapid 1-click access on your trusted devices.</small>
          </label>

          <label className="field" style={{ marginTop: '10px' }}>
            <span>Current Owner Password (optional verification)</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password if set"
            />
          </label>

          <button
            type="submit"
            className="button primary"
            style={{ marginTop: '12px' }}
            disabled={savingPin || !newPin.trim()}
          >
            <KeyRound size={15} />
            {savingPin ? 'Saving PIN…' : hasPin ? 'Update Owner PIN' : 'Set Owner PIN'}
          </button>
        </form>
      </section>

      <div className="security-grid">
        {[
          {
            icon: LockKeyhole,
            title: 'Owner sign-in & encryption',
            text: 'Your account credentials (username, password, PIN) are hashed with PBKDF2 SHA-256 (100,000 iterations). Raw secrets are never stored in plain text.',
          },
          {
            icon: KeyRound,
            title: 'Server-side keys & isolation',
            text: 'Instagram tokens and model keys stay encrypted on the server and are only accessible by your authenticated owner session.',
          },
          {
            icon: Smartphone,
            title: 'Approved phones',
            text: 'One-time codes expire after 10 minutes. New phone sessions last 30 days and can be disconnected immediately.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <section className="settings-card" key={title}>
            <Icon className="security-card-icon" size={24} />
            <h3>{title}</h3>
            <p className="body-note">{text}</p>
          </section>
        ))}
      </div>

      <MobilePairing />
    </div>
  );
}
