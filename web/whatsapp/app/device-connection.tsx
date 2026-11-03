'use client';

import { useState } from 'react';
import {
  Check,
  ChevronRight,
  Link2,
  Loader2,
  MessageSquare,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
  Sparkles,
} from 'lucide-react';

type DeviceStatus = {
  state?: string;
  connectedPhone?: string;
  qrDataUrl?: string;
  error?: string;
};

type Props = {
  apiBase?: string;
  tenantId?: string;
  businessName?: string;
  waStatus: DeviceStatus | null;
  onRefresh: () => void;
  onAction: (action: string, body?: unknown) => Promise<unknown>;
};

const features = [
  { icon: Link2, title: 'Simple QR Pairing', description: 'Link your WhatsApp number by scanning the instant QR code.' },
  { icon: ShieldCheck, title: 'Enterprise Isolation', description: 'Your conversations and customers remain private to your workspace.' },
  { icon: MessageSquare, title: 'Smart AI Replies', description: 'Shared luxury concierge responds to questions and inquiries instantly.' },
  { icon: Monitor, title: 'Live Orders & Mapping', description: 'Real-time sync between incoming WhatsApp orders and the delivery map.' },
];

export default function DeviceConnection({
  apiBase = '/business/api',
  tenantId,
  businessName = 'your business',
  waStatus,
  onRefresh,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connected = waStatus?.state === 'connected';
  const hasQR = waStatus?.state === 'qr' && !!waStatus.qrDataUrl;
  const connecting = busy || waStatus?.state === 'connecting';
  const state = connected ? 'connected' : hasQR ? 'scan' : connecting ? 'connecting' : waStatus ? 'offline' : 'checking';

  const label = {
    connected: 'Connected & Live',
    scan: 'Scan QR to Pair',
    connecting: 'Preparing Session…',
    offline: 'Disconnected',
    checking: 'Checking Status…',
  }[state];

  const description = connected
    ? `Linked to ${waStatus?.connectedPhone ? '+' + waStatus.connectedPhone : 'your WhatsApp account'}. Automated replies and live order syncing are active.`
    : hasQR
    ? 'Scan this pairing QR code from Linked Devices in WhatsApp on your phone to connect.'
    : connecting
    ? 'Connecting to WhatsApp multi-device gateway. Please wait a moment…'
    : 'Connect a WhatsApp business or personal number to bring real customer conversations and catalog orders into your control room.';

  async function deviceAction(action: 'connect' | 'disconnect') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(apiBase + '/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tenantId }),
      });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update connection. Please try again.');
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wa-device" style={styles.container} aria-labelledby="device-page-title">
      {/* Status Bar */}
      <header className="wa-device-status" data-status={state} style={styles.statusBar}>
        <div style={styles.statusIconBox}>
          <Smartphone size={22} color="#7354da" strokeWidth={1.8} />
        </div>
        <div style={styles.statusContent}>
          <div style={styles.statusHeadingRow}>
            <h1 id="device-page-title" style={styles.statusTitle}>
              {businessName} · WhatsApp Automation
            </h1>
            <span
              className="wa-device-badge"
              role="status"
              style={{
                ...styles.badge,
                background: connected ? 'rgba(16, 185, 129, 0.12)' : hasQR || connecting ? 'rgba(245, 158, 11, 0.14)' : 'rgba(100, 116, 139, 0.14)',
                color: connected ? '#059669' : hasQR || connecting ? '#d97706' : '#64748b',
                borderColor: connected ? 'rgba(16, 185, 129, 0.3)' : hasQR || connecting ? 'rgba(245, 158, 11, 0.3)' : 'rgba(100, 116, 139, 0.3)',
              }}
            >
              <span
                style={{
                  ...styles.badgeDot,
                  background: connected ? '#10b981' : hasQR || connecting ? '#f59e0b' : '#94a3b8',
                }}
              />
              {label}
            </span>
          </div>
          <p style={styles.statusDesc}>{description}</p>
        </div>
        <button
          type="button"
          className="wa-device-refresh"
          onClick={onRefresh}
          aria-label="Refresh connection status"
          title="Refresh connection status"
          style={styles.refreshBtn}
        >
          <RefreshCw size={17} color="#64748b" />
        </button>
      </header>

      {/* Error alert */}
      {(error || waStatus?.error) && (
        <div className="wa-device-error" role="alert" style={styles.errorAlert}>
          {error || waStatus?.error}
        </div>
      )}

      {/* Main Connection Card */}
      <div className="wa-device-card" style={styles.mainCard}>
        {connected ? (
          <div>
            <div style={{ ...styles.heroIconBox, background: '#edf7f1', color: '#10b981', borderColor: '#bbf7d0' }}>
              <Check size={32} strokeWidth={2.2} />
            </div>
            <h2 style={styles.cardTitle}>Your WhatsApp is Connected & Live</h2>
            <p style={styles.cardDesc}>
              Your phone ({waStatus?.connectedPhone ? '+' + waStatus.connectedPhone : 'linked account'}) is receiving customer messages, answering queries with your catalog, and routing Flipkart-style delivery orders into your control room.
            </p>
            <div style={styles.connectedNote}>
              <ShieldCheck size={18} color="#059669" />
              <span>Full owner privacy. Encryption and AI behavior tone are configured in your workspace.</span>
            </div>
            <button
              className="wa-device-disconnect"
              type="button"
              disabled={busy}
              onClick={() => void deviceAction('disconnect')}
              style={styles.disconnectBtn}
            >
              <Unplug size={16} /> Disconnect Device
            </button>
          </div>
        ) : hasQR ? (
          <div>
            <span style={styles.cardEyebrow}>MULTI-DEVICE PAIRING</span>
            <h2 style={styles.cardTitle}>Scan QR Code with WhatsApp</h2>
            <p style={styles.cardDesc}>
              Open WhatsApp on your mobile phone, navigate to <strong>Settings → Linked Devices → Link a device</strong>, and scan the QR code below.
            </p>
            <div className="wa-device-qr" style={styles.qrContainer}>
              <img
                src={waStatus?.qrDataUrl}
                width={250}
                height={250}
                alt="WhatsApp device pairing QR code"
                style={{ display: 'block', borderRadius: 8, margin: '0 auto' }}
              />
            </div>
            <ol className="wa-device-steps" style={styles.stepsList}>
              <li style={styles.stepItem}>
                <span style={styles.stepNum}>1</span> Open WhatsApp on your primary phone.
              </li>
              <li style={styles.stepItem}>
                <span style={styles.stepNum}>2</span> Tap <strong>Settings</strong> (iOS) or <strong>Three Dots ⋮</strong> (Android) → <strong>Linked devices</strong>.
              </li>
              <li style={styles.stepItem}>
                <span style={styles.stepNum}>3</span> Tap <strong>Link a device</strong> and point your camera at this QR code.
              </li>
            </ol>
            <p style={styles.cardFootnote}>
              Treat this QR code like a temporary access pass. Do not share your screen with untrusted parties.
            </p>
          </div>
        ) : (
          <div>
            <div style={styles.heroIconBox}>
              <Smartphone size={32} strokeWidth={1.8} color="#7354da" />
            </div>
            <span style={styles.cardEyebrow}>DEVICE PAIRING SETUP</span>
            <h2 style={styles.cardTitle}>Link your WhatsApp Number</h2>
            <p style={styles.cardDesc}>
              Connect the WhatsApp number your customers reach you on. Messages and orders appear in your business workspace. Your published catalog stays up to date with your saved products.
            </p>

            <div className="wa-device-features" style={styles.featuresGrid}>
              {features.map(({ icon: Icon, title, description: desc }) => (
                <div className="wa-device-feature" key={title} style={styles.featureItem}>
                  <div style={styles.featureIcon}>
                    <Icon size={18} color="#7354da" />
                  </div>
                  <h3 style={styles.featureTitle}>{title}</h3>
                  <p style={styles.featureDesc}>{desc}</p>
                </div>
              ))}
            </div>

            <button
              className="wa-device-primary"
              type="button"
              disabled={connecting}
              onClick={() => void deviceAction('connect')}
              style={{
                ...styles.primaryBtn,
                opacity: connecting ? 0.7 : 1,
              }}
            >
              {connecting ? (
                <>
                  <Loader2 size={18} className="spin" /> Generating QR Code…
                </>
              ) : (
                <>
                  <Link2 size={18} /> Link WhatsApp Device <ChevronRight size={17} />
                </>
              )}
            </button>

            <p style={styles.cardFootnote}>
              One phone number belongs to one business workspace. You need access to the phone you are linking.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: 860,
    margin: '0 auto',
    padding: '24px 16px 48px',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '20px 24px',
    marginBottom: 20,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
  },
  statusIconBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 46px',
    width: 46,
    height: 46,
    borderRadius: 12,
    background: '#f5f0fc',
    border: '1px solid #e0d5f8',
  },
  statusContent: {
    flex: 1,
    minWidth: 0,
  },
  statusHeadingRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '-0.3px',
    margin: 0,
    color: '#1e293b',
  },
  statusDesc: {
    fontSize: 13,
    lineHeight: 1.5,
    margin: '4px 0 0',
    color: '#64748b',
    maxWidth: 620,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    border: '1px solid',
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 38px',
    width: 38,
    height: 38,
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  errorAlert: {
    padding: '12px 16px',
    marginBottom: 16,
    color: '#b91c1c',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 500,
  },
  mainCard: {
    padding: '38px 32px 34px',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(115, 84, 218, 0.04)',
  },
  heroIconBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    margin: '0 auto 18px',
    borderRadius: 18,
    background: '#f5f0fc',
    border: '1px solid #e0d5f8',
  },
  cardEyebrow: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: '#7354da',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 'clamp(22px, 3vw, 28px)',
    fontWeight: 700,
    letterSpacing: '-0.6px',
    color: '#1e293b',
    margin: '0 0 10px',
  },
  cardDesc: {
    maxWidth: 520,
    margin: '0 auto',
    color: '#64748b',
    fontSize: 14,
    lineHeight: 1.6,
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 14,
    margin: '28px auto 32px',
    maxWidth: 640,
    textAlign: 'left',
  },
  featureItem: {
    padding: 16,
    borderRadius: 12,
    background: '#fafbfc',
    border: '1px solid #e2e8f0',
  },
  featureIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    background: '#f5f0fc',
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 13.5,
    fontWeight: 650,
    color: '#1e293b',
    margin: '0 0 4px',
  },
  featureDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.5,
    margin: 0,
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    padding: '12px 28px',
    borderRadius: 11,
    fontSize: 14,
    fontWeight: 650,
    background: '#7354da',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 3px 12px rgba(115, 84, 218, 0.25)',
    transition: 'all 0.15s ease',
  },
  disconnectBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 24,
    padding: '10px 20px',
    borderRadius: 10,
    fontSize: 13.5,
    fontWeight: 600,
    background: '#fff1f2',
    color: '#e11d48',
    border: '1px solid #fecdd3',
    cursor: 'pointer',
  },
  connectedNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 18px',
    margin: '22px auto 0',
    maxWidth: 540,
    borderRadius: 12,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#166534',
    fontSize: 13,
  },
  qrContainer: {
    display: 'inline-block',
    margin: '24px auto',
    padding: 16,
    background: '#ffffff',
    border: '1.5px solid #e2e8f0',
    borderRadius: 16,
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  },
  stepsList: {
    listStyle: 'none',
    padding: 0,
    margin: '20px auto',
    maxWidth: 440,
    textAlign: 'left',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
    color: '#334155',
    margin: '10px 0',
  },
  stepNum: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 22px',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#f5f0fc',
    color: '#7354da',
    border: '1px solid #e0d5f8',
    fontSize: 11,
    fontWeight: 700,
  },
  cardFootnote: {
    fontSize: 12,
    color: '#94a3b8',
    margin: '16px auto 0',
    maxWidth: 440,
    lineHeight: 1.5,
  },
};
