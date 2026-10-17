'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, ArrowRight, Sparkles, KeyRound, AlertCircle, Eye, EyeOff, UserPlus, LogIn, CheckCircle2, User } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [hasSignedUp, setHasSignedUp] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [alreadyAuth, setAlreadyAuth] = useState(false);

  useEffect(() => {
    // Check auth status & whether signup is already completed
    fetch('/api/auth')
      .then(res => res.json())
      .then((data: any) => {
        if (data?.authenticated) {
          setAlreadyAuth(true);
        }
        if (data?.hasSignedUp === false) {
          // If no owner account exists yet, direct user to Sign Up
          setHasSignedUp(false);
          setMode('signup');
        } else {
          // If signup already completed, show primary Login page
          setHasSignedUp(true);
          setMode('login');
        }
      })
      .catch(() => {
        setHasSignedUp(true);
        setMode('login');
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      if (!username.trim() || username.trim().length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter.');
        return;
      }
    } else {
      if (!password) {
        setError('Please enter your owner password or PIN.');
        return;
      }
    }

    setBusy(true);

    try {
      const payload = mode === 'signup' 
        ? { action: 'signup', username: username.trim(), password }
        : { action: 'login', username: username.trim() || undefined, password };

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Success -> navigate to dashboard
      router.push('/?view=overview');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Unable to authenticate. Verify your credentials.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-art">
        <div className="login-brand">
          <span className="brand-mark">n<span>✦</span></span>
          <span>Nina</span>
        </div>
        <div className="login-intro">
          <div className="section-kicker">PRIVATE OWNER WORKSPACE</div>
          <h1>Your conversations.<br />Your voice. In control.</h1>
          <p>
            Private Instagram AI automation, uncensored creative testing, and multi-model routing in one encrypted command center.
          </p>
          <div className="login-orbit">
            <Sparkles size={34} />
            <span>Single Owner Security<br />Private & Isolated</span>
          </div>
        </div>
        <small>Nina Control Room · End-to-End Private Session · v2.4</small>
      </div>

      <section className="login-form">
        <div className="login-mobile-brand">
          <span className="brand-mark">n<span>✦</span></span>
          <span>Nina</span>
          <span className="brand-caption">CONTROL ROOM</span>
        </div>

        <div className="login-lock-badge">
          <ShieldCheck size={32} />
        </div>
        
        <div className="section-kicker">
          {mode === 'signup' ? 'FIRST-TIME SETUP' : 'OWNER AUTHENTICATION'}
        </div>
        <h2>{mode === 'signup' ? 'Create Owner Account' : 'Owner Sign In'}</h2>
        <p>
          {mode === 'signup'
            ? 'Set your permanent owner username and password. Nobody else will be able to register or access your connected Instagram accounts and data.'
            : 'Enter your owner username and password or PIN to unlock your workspace.'}
        </p>

        {alreadyAuth ? (
          <div className="already-logged-in-card">
            <CheckCircle2 size={24} style={{ color: '#10b981' }} />
            <div>
              <b style={{ fontSize: '15px' }}>Session Active</b>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>You are authenticated on this browser as Workspace Owner.</p>
            </div>
            <button 
              className="button primary full-button" 
              style={{ marginTop: '14px' }}
              onClick={() => router.push('/?view=overview')}
            >
              Enter Dashboard <ArrowRight size={17} />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-pin-form">
            {error && (
              <div className="login-error-alert" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="login-username">
                <span>{mode === 'signup' ? 'Owner Username' : 'Username'}</span>
              </label>
              <div className="relative-input-wrapper">
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === 'signup' ? 'e.g. nina_owner' : 'Enter owner username'}
                  autoComplete="username"
                  autoFocus={mode === 'signup'}
                  required={mode === 'signup'}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="login-password">
                <span>{mode === 'signup' ? 'Owner Password' : 'Password or PIN'}</span>
              </label>
              <div className="relative-input-wrapper">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a secure password (min 6 chars)' : 'Enter your password or PIN'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  autoFocus={mode === 'login'}
                  maxLength={64}
                  className="pin-input"
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  className="toggle-visibility-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="confirm-password">
                  <span>Confirm Password</span>
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  disabled={busy}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="button primary login-cta full-button"
              disabled={busy}
            >
              {busy ? (
                <>Verifying credentials…</>
              ) : mode === 'signup' ? (
                <>
                  <UserPlus size={17} />
                  Create Owner Account & Unlock
                  <ArrowRight size={17} />
                </>
              ) : (
                <>
                  <KeyRound size={17} />
                  Unlock Workspace
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        )}

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <a
            href="/demo"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 16px',
              width: '100%',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12))',
              border: '1px solid rgba(129, 140, 248, 0.35)',
              color: '#818cf8',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <Sparkles size={15} />
            <span>Try Public Interactive Demo (No Login Required)</span>
            <ArrowRight size={14} />
          </a>
        </div>

        <div className="login-security" style={{ marginTop: '22px' }}>
          <ShieldCheck size={14} />
          <span>PBKDF2 SHA-256 Encrypted Keystore · Single-Device Cookie Authentication</span>
        </div>
      </section>
    </main>
  );
}
