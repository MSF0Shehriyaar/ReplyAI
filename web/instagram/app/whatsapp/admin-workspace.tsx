'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Sparkles, Building2, ShieldCheck, ChevronRight, Plus } from 'lucide-react';
import type { AdminSnapshot } from '../../../whatsapp/lib/admin-model';

const BusinessDashboard = dynamic(
  () => import('../../../whatsapp/app/business-dashboard'),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 12, color: '#7354da' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid #e0d5f8', borderTopColor: '#7354da', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Opening workspace…</span>
      </div>
    ),
  }
);

const NinaAdmin = dynamic(
  () => import('./nina-admin'),
  { ssr: false }
);

const base = '/api/whatsapp-service';

export default function AdminWorkspace({
  ownerName,
  businessOrigin = '',
}: {
  ownerName: string;
  businessOrigin?: string;
}) {
  const [business, setBusiness] = useState<{ id: string; name: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [create, setCreate] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setMounted(true);
    setBusiness({ id: 'biz_titan_watches', name: 'Nina Kurain' });
  }, []);

  useEffect(() => {
    if (create) dialog.current?.showModal();
  }, [create]);

  const expired = useCallback(() => window.location.assign('/login?return_to=%2Fwhatsapp'), []);

  async function action(action: string, body?: unknown) {
    const response = await fetch(base + '/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(body as object) }),
    });
    const result: any = await response.json();
    if (response.status === 401) {
      expired();
      return;
    }
    if (!response.ok) throw new Error(result.error || 'Action failed.');
    return result;
  }

  const isNinaPersonal = business?.id === 'biz_titan_watches';

  return (
    <main suppressHydrationWarning className={'wa-app wa-dashboard' + (business ? '' : ' wa-platform')}>
      {/* Mobile-First Master Admin Header */}
      <header className="private-service-header" style={navStyles.header}>
        <div style={navStyles.leftGroup}>
          <a href="/" style={navStyles.backLink} title="Return to Instagram Suite">
            <ArrowLeft size={15} />
            <span style={navStyles.backText}>Instagram</span>
          </a>
          <div style={navStyles.divider} />
          <div style={navStyles.brandGroup}>
            <span style={navStyles.avatar}>NK</span>
            <div>
              <strong style={navStyles.brandTitle}>Nina Kurain</strong>
              <small style={navStyles.brandSub}>Master Control</small>
            </div>
          </div>
        </div>

        {/* Switcher Controls */}
        <div style={navStyles.switcherGroup}>
          <button
            type="button"
            className={isNinaPersonal ? 'active-header-tab' : ''}
            onClick={() => setBusiness({ id: 'biz_titan_watches', name: 'Nina Kurain' })}
            style={{
              ...navStyles.switchBtn,
              background: isNinaPersonal ? '#7354da' : '#ffffff',
              color: isNinaPersonal ? '#ffffff' : '#475569',
              borderColor: isNinaPersonal ? '#7354da' : '#e2e8f0',
              boxShadow: isNinaPersonal ? '0 2px 8px rgba(115, 84, 218, 0.25)' : 'none',
            }}
          >
            <Sparkles size={14} />
            <span>Nina's Automation</span>
          </button>

          <button
            type="button"
            className={!business ? 'active-header-tab' : ''}
            onClick={() => setBusiness(null)}
            style={{
              ...navStyles.switchBtn,
              background: !business ? '#7354da' : '#ffffff',
              color: !business ? '#ffffff' : '#475569',
              borderColor: !business ? '#7354da' : '#e2e8f0',
              boxShadow: !business ? '0 2px 8px rgba(115, 84, 218, 0.25)' : 'none',
            }}
          >
            <Building2 size={14} />
            <span>Business Directory</span>
          </button>

          {business && !isNinaPersonal && (
            <button
              type="button"
              onClick={() => setBusiness(null)}
              style={navStyles.exitTenantBtn}
            >
              <ArrowLeft size={14} /> Back to Directory
            </button>
          )}
        </div>
      </header>

      {!create && error && (
        <p className="nina-admin-error" role="alert" style={{ margin: '14px 16px' }}>
          {error}
        </p>
      )}

      {business ? (
        <BusinessDashboard
          key={business.id}
          initialTab={isNinaPersonal ? 'catalog' : 'inbox'}
          apiBase={base}
          catalogBase={businessOrigin + '/business/catalog'}
          tenantId={business.id}
          requireProfile={false}
          identity={{ businessName: business.name, userName: ownerName }}
          onSessionExpired={expired}
          onExit={() => setBusiness(null)}
        />
      ) : (
        <NinaAdmin
          key={revision}
          onSessionExpired={expired}
          onAction={action}
          onOpenOnboard={() => {
            setError('');
            setCreate(true);
          }}
          onSwitchBusiness={async id => {
            try {
              const response = await fetch(base + '/admin', { cache: 'no-store' });
              const data = (await response.json()) as AdminSnapshot;
              const selected = data.tenants?.find(tenant => tenant.id === id);
              if (!response.ok || !selected) throw new Error('Business unavailable.');
              setBusiness({ id, name: selected.name });
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Business unavailable.');
            }
          }}
        />
      )}

      {create && (
        <dialog
          ref={dialog}
          onCancel={() => setCreate(false)}
          className="private-business-create"
          aria-labelledby="create-business-title"
        >
          <h2 id="create-business-title">Create Business Workspace</h2>
          <p>The business will complete its assistant profile after its first sign-in.</p>
          <form
            onSubmit={async event => {
              event.preventDefault();
              setBusy(true);
              setError('');
              const form = new FormData(event.currentTarget);
              try {
                const response = await fetch(base + '/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'create-business',
                    businessName: form.get('businessName'),
                    ownerName: form.get('ownerName'),
                    email: form.get('email'),
                    password: form.get('password'),
                  }),
                });
                const data: any = await response.json();
                if (!response.ok) throw new Error(data.error || 'Creation failed.');
                setCreate(false);
                setRevision(value => value + 1);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Creation failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Business name
              <input name="businessName" required minLength={2} maxLength={160} />
            </label>
            <label>
              Business owner
              <input name="ownerName" required minLength={2} maxLength={160} />
            </label>
            <label>
              Owner email
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Temporary password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <footer>
              <button type="button" onClick={() => setCreate(false)}>
                Cancel
              </button>
              <button disabled={busy} type="submit">
                {busy ? 'Creating workspace…' : 'Create business'}
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </main>
  );
}

const navStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 18px',
    background: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    flexWrap: 'wrap',
    gap: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 12px',
    borderRadius: 8,
    background: '#f5f0fc',
    color: '#7354da',
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: 'none',
    border: '1px solid #ebdcfc',
  },
  backText: {
    display: 'inline',
  },
  divider: {
    width: 1,
    height: 22,
    background: '#e2e8f0',
  },
  brandGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#eee7fc',
    color: '#7354da',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
  },
  brandTitle: {
    fontSize: 13,
    color: '#0f172a',
    display: 'block',
    lineHeight: 1.2,
  },
  brandSub: {
    fontSize: 10.5,
    color: '#64748b',
    display: 'block',
  },
  switcherGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  switchBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  exitTenantBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    borderRadius: 8,
    background: '#fff1f2',
    border: '1px solid #fecdd3',
    color: '#e11d48',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
