'use client';

import { useState } from 'react';
import { Globe, Lock, CheckCircle2, ExternalLink, Save, Loader2, Sparkles } from 'lucide-react';
import type { CatalogPublication } from '../lib/model';

export default function PublicationSettings({
  publication,
  onSave,
}: {
  publication?: CatalogPublication;
  onSave: (slug: string, published: boolean) => Promise<boolean>;
}) {
  const [slug, setSlug] = useState(publication?.slug || '');
  const [published, setPublished] = useState(!!publication?.published);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const formattedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const liveUrl = publication?.url || (slug ? `/business/catalog/${slug}` : '');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess(false);
    try {
      const ok = await onSave(formattedSlug, published);
      if (ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('The publication settings could not be saved. Please retry.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save publication settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wa-publication-card" style={styles.card}>
      {/* Header with Eyebrow and Status Badge */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.iconCircle}>
            {published ? <Globe size={20} color="#7354da" /> : <Lock size={20} color="#7354da" />}
          </div>
          <div>
            <div style={styles.eyebrowRow}>
              <span style={styles.eyebrow}>CATALOG STOREFRONT URL</span>
              <span
                style={{
                  ...styles.statusBadge,
                  background: published ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.18)',
                  color: published ? '#059669' : '#64748b',
                  borderColor: published ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)',
                }}
              >
                <span
                  style={{
                    ...styles.statusDot,
                    background: published ? '#10b981' : '#94a3b8',
                  }}
                />
                {published ? 'Live & Published' : 'Private (Draft)'}
              </span>
            </div>
            <h3 style={styles.title}>
              {published ? 'Your collection is live online' : 'Your catalog is private until published'}
            </h3>
            <p style={styles.description}>
              Choose a custom address slug for your public storefront. Only published products, business name, and enquiry WhatsApp are exposed to clients.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Address Input Group */}
        <div style={styles.fieldGroup}>
          <label style={styles.fieldLabel}>
            Custom Catalog Address (Slug)
          </label>
          <div style={styles.slugInputWrapper}>
            <span style={styles.slugPrefix}>
              /business/catalog/
            </span>
            <input
              type="text"
              value={slug}
              maxLength={64}
              placeholder="e.g. nina-collection"
              pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
              onChange={event => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              style={styles.slugInput}
            />
          </div>
          <small style={styles.fieldHint}>
            Full URL:{' '}
            <strong style={{ color: '#7354da', wordBreak: 'break-all' }}>
              https://automation.ninakurainservices.in/business/catalog/{formattedSlug || 'your-chosen-slug'}
            </strong>
          </small>
        </div>

        {/* Publish Toggle Box */}
        <div style={styles.toggleCard}>
          <label style={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={published}
              onChange={event => setPublished(event.target.checked)}
              style={styles.toggleCheckbox}
            />
            <div style={styles.toggleContent}>
              <strong style={styles.toggleTitle}>Publish this catalog to clients</strong>
              <p style={styles.toggleDescription}>
                When checked, customers can browse your collection and submit Flipkart-style delivery orders into your WhatsApp inbox.
              </p>
            </div>
          </label>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div style={styles.errorAlert} role="alert">
            {error}
          </div>
        )}
        {success && (
          <div style={styles.successAlert} role="status">
            <CheckCircle2 size={16} /> Catalog address settings saved successfully!
          </div>
        )}

        {/* Actions Row */}
        <div style={styles.actionsRow}>
          <button
            type="submit"
            disabled={busy}
            style={{
              ...styles.submitBtn,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="spin" /> Saving…
              </>
            ) : (
              <>
                <Save size={16} /> Save Catalog Address
              </>
            )}
          </button>

          {published && liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.openLink}
            >
              <ExternalLink size={15} /> Open Published Catalog ↗
            </a>
          )}
        </div>
      </form>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '22px 20px',
    marginBottom: 24,
    boxShadow: '0 4px 18px rgba(115, 84, 218, 0.04)',
    color: '#1e293b',
  },
  header: {
    marginBottom: 18,
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: 16,
  },
  headerLeft: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: '#f5f0fc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid #ebdcfc',
  },
  eyebrowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '1.2px',
    color: '#7354da',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid transparent',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1e1b4b',
    margin: '4px 0 6px',
    letterSpacing: '-0.3px',
  },
  description: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 1.6,
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
  },
  slugInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    border: '1.5px solid #cbd5e1',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#f8fafc',
    transition: 'border-color 0.15s ease',
  },
  slugPrefix: {
    padding: '11px 14px',
    background: '#f1f5f9',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 500,
    borderRight: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  slugInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    padding: '11px 14px',
    fontSize: 14,
    color: '#0f172a',
    background: '#ffffff',
    minWidth: 0,
    fontWeight: 500,
  },
  fieldHint: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.5,
  },
  toggleCard: {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '14px 16px',
    background: '#fbfbfe',
    cursor: 'pointer',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    cursor: 'pointer',
  },
  toggleCheckbox: {
    width: 19,
    height: 19,
    marginTop: 2,
    cursor: 'pointer',
    accentColor: '#7354da',
  },
  toggleContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  toggleTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: '#1e293b',
  },
  toggleDescription: {
    fontSize: 12,
    color: '#64748b',
    margin: 0,
    lineHeight: 1.5,
  },
  errorAlert: {
    padding: '10px 14px',
    borderRadius: 8,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    fontSize: 12.5,
  },
  successAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 8,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#15803d',
    fontSize: 12.5,
    fontWeight: 500,
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  submitBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: '#7354da',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    padding: '11px 22px',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(115, 84, 218, 0.25)',
  },
  openLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    color: '#7354da',
    background: '#f5f0fc',
    border: '1px solid #e0d5f8',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
};
