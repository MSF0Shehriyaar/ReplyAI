'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  WAWorkspace,
  WAThread,
  WASettings,
  WAConnections,
  WAAnalytics,
  QuickReply,
  CustomerProfile,
  CatalogItem,
  WAOrder,
  DeliveryLocation,
} from '@/lib/whatsapp/model';
import { initialWAWorkspace, waDefaults, titanWatchesCatalog } from '@/lib/whatsapp/model';

// ── API Helpers ─────────────────────────────────────────────────────────

async function api(action: string, body?: any) {
  const res = await fetch('/api/whatsapp/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function loadWorkspace(): Promise<WAWorkspace> {
  const res = await fetch(`/api/whatsapp/workspace?_t=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
  });
  if (!res.ok) throw new Error('Failed to load workspace');
  return res.json();
}

export function getGoogleMapsSearchUrl(loc?: DeliveryLocation | null): string {
  if (!loc) return '#';
  if (loc.raw?.includes('1302') && loc.raw?.toLowerCase().includes('sathgalli')) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('1302, Sathgalli Layout, Dr Rajkumar Road, Mysuru, Karnataka 570019');
  }
  if (/mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(loc.raw || '')) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Mohommadiya Masjid, Shantinagar North, Rajiv Nagar, Mysuru 570019');
  }
  const clean = (loc.raw || '').replace(/^#\s*/, '').trim();
  const pin = loc.pincode && !clean.includes(loc.pincode) ? ` ${loc.pincode}` : '';
  const city = loc.city && !clean.toLowerCase().includes(loc.city.toLowerCase()) ? `, ${loc.city}` : '';
  const state = !clean.toLowerCase().includes('karnataka') ? ', Karnataka' : '';
  const query = `${clean}${city}${state}${pin}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || loc.formattedAddress || loc.raw || '')}`;
}

export function getGoogleMapsDirectionsUrl(loc?: DeliveryLocation | null): string {
  if (!loc) return '#';
  if (loc.raw?.includes('1302') && loc.raw?.toLowerCase().includes('sathgalli')) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('1302, Sathgalli Layout, Dr Rajkumar Road, Mysuru, Karnataka 570019');
  }
  if (/mohommadiya|mohammadiya|shanthinagar|shantinagar/i.test(loc.raw || '')) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('Mohommadiya Masjid, Shantinagar North, Rajiv Nagar, Mysuru 570019');
  }
  const clean = (loc.raw || '').replace(/^#\s*/, '').trim();
  const pin = loc.pincode && !clean.includes(loc.pincode) ? ` ${loc.pincode}` : '';
  const city = loc.city && !clean.toLowerCase().includes(loc.city.toLowerCase()) ? `, ${loc.city}` : '';
  const state = !clean.toLowerCase().includes('karnataka') ? ', Karnataka' : '';
  const query = `${clean}${city}${state}${pin}`.trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query || loc.formattedAddress || loc.raw || '')}`;
}

// ── Main Command Center ─────────────────────────────────────────────────

export default function WhatsAppCommandCenter() {
  const [workspace, setWorkspace] = useState<WAWorkspace>(initialWAWorkspace);
  const [activeTab, setActiveTab] = useState<'inbox' | 'orders' | 'catalog' | 'business' | 'brain' | 'analytics' | 'connect'>('inbox');
  const [selectedThread, setSelectedThread] = useState<WAThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const [waStatus, setWaStatus] = useState<any>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await loadWorkspace();
      setWorkspace(data as any);
    } catch (e: any) {
      console.warn('Refresh error:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshConnect = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/connect');
      if (res.ok) setWaStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    refreshConnect();
    const interval = setInterval(() => {
      refresh();
      refreshConnect();
    }, 4000);
    return () => clearInterval(interval);
  }, [refresh, refreshConnect]);

  // Keep selectedThread in sync with fresh workspace data
  useEffect(() => {
    if (selectedThread) {
      const fresh = (workspace.threads || []).find((t) => t.id === selectedThread.id);
      if (fresh) {
        setSelectedThread(fresh);
      } else {
        setSelectedThread(null);
      }
    }
  }, [workspace.threads]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const doAction = async (action: string, body?: any) => {
    try {
      await api(action, body);
      await refresh();
      showToast('Action successful ✓');
    } catch (e: any) {
      showToast('Error: ' + e.message);
    }
  };

  const currentSettings: WASettings = {
    ...waDefaults,
    ...(workspace.settings || {}),
    catalog: workspace.settings?.catalog?.length ? workspace.settings.catalog : titanWatchesCatalog,
  };

  // Filter threads
  const filteredThreads = (workspace.threads || []).filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div style={ui.loadingScreen}>
        <div style={ui.spinner} />
        <p style={{ color: '#94a3b8', marginTop: 18, fontWeight: 500, letterSpacing: 0.5 }}>
          Initializing {currentSettings.businessName} Concierge Engine...
        </p>
      </div>
    );
  }

  return (
    <div style={ui.root}>
      {/* Toast Notification */}
      {toast && <div style={ui.toast}>{toast}</div>}

      {/* Header Bar */}
      <header style={ui.header}>
        <div style={ui.headerLeft}>
          <div style={ui.brandGroup}>
            <div style={ui.brandIcon}>⏱️</div>
            <div>
              <div style={ui.brandTitleRow}>
                <span style={ui.brandTitle}>{currentSettings.businessName}</span>
                <button onClick={() => setShowBusinessModal(true)} style={ui.changeBusinessBtn} title="Customize business profile">
                  Switch / Edit Business
                </button>
              </div>
              <span style={ui.brandTagline}>{currentSettings.tagline}</span>
            </div>
          </div>
        </div>

        {/* Header Right Status */}
        <div style={ui.headerRight}>
          <a
            href="/catalog"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(217, 119, 6, 0.15)',
              border: '1px solid rgba(217, 119, 6, 0.4)',
              color: '#fbbf24',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
            title="Open Interactive Visual Boutique Catalog"
          >
            <span>🛍️ Visual Catalog Boutique ↗</span>
          </a>

          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(115, 84, 218, 0.15)',
              border: '1px solid rgba(115, 84, 218, 0.4)',
              color: '#c4b5fd',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
            title="Go to Instagram Control Room"
          >
            <span>📸 Instagram Control Room</span>
          </a>

          <div
            onClick={() => setActiveTab('connect')}
            style={{
              ...ui.connectionPill,
              border: waStatus?.state === 'connected' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              background: waStatus?.state === 'connected' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                ...ui.statusDot,
                background: waStatus?.state === 'connected' ? '#10b981' : '#ef4444',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: waStatus?.state === 'connected' ? '#10b981' : '#ef4444' }}>
              {waStatus?.state === 'connected' ? `Linked (${waStatus.connectedPhone || 'Live'})` : 'WhatsApp Disconnected'}
            </span>
          </div>

          <div
            style={{ ...ui.kpiPill, cursor: 'pointer', border: activeTab === 'orders' ? '1px solid #10b981' : undefined }}
            onClick={() => setActiveTab('orders')}
            title="View Orders & Delivery Map"
          >
            <span style={{ ...ui.kpiValue, color: '#34d399' }}>{workspace.orders?.length || 0}</span>
            <span style={ui.kpiLabel}>Orders & Map</span>
          </div>

          <div style={ui.kpiPill}>
            <span style={ui.kpiValue}>{workspace.threads?.length || 0}</span>
            <span style={ui.kpiLabel}>Chats</span>
          </div>

          <div style={ui.kpiPill}>
            <span style={ui.kpiValue}>{currentSettings.catalog?.length || 7}</span>
            <span style={ui.kpiLabel}>Products</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav style={ui.nav}>
        {[
          { id: 'inbox', label: 'Live Inbox', icon: '💬' },
          { id: 'orders', label: 'Orders & Live Map', icon: '📍' },
          { id: 'catalog', label: 'Watches & Catalog', icon: '🛍️' },
          { id: 'business', label: 'Store Profile', icon: '🏢' },
          { id: 'brain', label: 'AI Behavior & Tone', icon: '🧠' },
          { id: 'analytics', label: 'Analytics & Leads', icon: '📊' },
          { id: 'connect', label: 'WhatsApp Device', icon: '📱' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              ...ui.navBtn,
              ...(activeTab === tab.id ? ui.navBtnActive : {}),
            }}
          >
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Container */}
      <main style={ui.mainContent}>
        {activeTab === 'inbox' && (
          <InboxView
            threads={filteredThreads}
            selectedThread={selectedThread}
            onSelectThread={setSelectedThread}
            onAction={doAction}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            settings={currentSettings}
          />
        )}
        {activeTab === 'orders' && (
          <OrdersAndMapView
            orders={workspace.orders || []}
            threads={workspace.threads || []}
            catalog={currentSettings.catalog}
            onAction={doAction}
            onJumpToChat={(threadId) => {
              const t = (workspace.threads || []).find((th) => th.id === threadId);
              if (t) {
                setSelectedThread(t);
                setActiveTab('inbox');
              }
            }}
          />
        )}
        {activeTab === 'catalog' && (
          <CatalogView
            catalog={currentSettings.catalog}
            onSave={(newCat) => doAction('save-settings', { settings: { ...currentSettings, catalog: newCat } })}
          />
        )}
        {activeTab === 'business' && (
          <BusinessSettingsView
            settings={currentSettings}
            onSave={(updated) => doAction('save-settings', { settings: updated })}
          />
        )}
        {activeTab === 'brain' && (
          <AIBrainSettingsView
            settings={currentSettings}
            onSave={(updated) => doAction('save-settings', { settings: updated })}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsView analytics={workspace.analytics} threads={workspace.threads || []} />
        )}
        {activeTab === 'connect' && (
          <ConnectView waStatus={waStatus} onAction={doAction} onRefresh={refreshConnect} />
        )}
      </main>

      {/* Quick Business Setup Modal */}
      {showBusinessModal && (
        <BusinessSetupModal
          settings={currentSettings}
          onClose={() => setShowBusinessModal(false)}
          onSave={async (updated) => {
            await doAction('save-settings', { settings: updated });
            setShowBusinessModal(false);
          }}
        />
      )}
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════
// ── INBOX VIEW ──────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function InboxView({
  threads,
  selectedThread,
  onSelectThread,
  onAction,
  filterStatus,
  setFilterStatus,
  searchQuery,
  setSearchQuery,
  settings,
}: {
  threads: WAThread[];
  selectedThread: WAThread | null;
  onSelectThread: (t: WAThread | null) => void;
  onAction: (action: string, body?: any) => Promise<void>;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  settings: WASettings;
}) {
  const [manualText, setManualText] = useState('');
  const [showQuick, setShowQuick] = useState(false);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const lastThreadIdRef = useRef<string>('');
  const lastMsgCountRef = useRef<number>(0);

  useEffect(() => {
    if (!selectedThread) return;
    const threadChanged = selectedThread.id !== lastThreadIdRef.current;
    const newMessagesAdded = selectedThread.messages.length > lastMsgCountRef.current;

    if (threadChanged || newMessagesAdded) {
      lastThreadIdRef.current = selectedThread.id;
      lastMsgCountRef.current = selectedThread.messages.length;
      if (messagesAreaRef.current) {
        messagesAreaRef.current.scrollTo({
          top: messagesAreaRef.current.scrollHeight,
          behavior: threadChanged ? 'auto' : 'smooth',
        });
      }
    }
  }, [selectedThread?.id, selectedThread?.messages?.length]);

  return (
    <div style={ui.inboxLayout}>
      {/* Left Chat List */}
      <div style={ui.inboxSidebar}>
        <div style={ui.searchWrapper}>
          <input
            type="text"
            placeholder="🔍 Search inquiries, clients, numbers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={ui.inputField}
          />
        </div>

        <div style={ui.filterPillRow}>
          {['all', 'open', 'review', 'resolved', 'escalated'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              style={{
                ...ui.statusFilterBtn,
                ...(filterStatus === st ? ui.statusFilterBtnActive : {}),
              }}
            >
              {st.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={ui.threadScrollList}>
          {threads.length === 0 && (
            <div style={ui.emptyStateBlock}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
              <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>No conversations yet</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                Incoming customer WhatsApp messages will appear here in real-time.
              </div>
            </div>
          )}

          {threads.map((t) => {
            const isSelected = selectedThread?.id === t.id;
            const lastMsg = t.messages?.at(-1)?.text || 'No message';
            return (
              <div
                key={t.id}
                onClick={() => onSelectThread(t)}
                style={{
                  ...ui.threadCard,
                  border: isSelected ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
                  background: isSelected ? 'rgba(16, 185, 129, 0.1)' : undefined,
                }}
              >
                <div style={ui.threadCardTop}>
                  <div style={ui.clientName}>
                    {t.customerProfile?.vip && '⭐ '}
                    {t.name}
                  </div>
                  <span
                    style={{
                      ...ui.sentimentBadge,
                      background:
                        t.sentiment === 'positive'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : t.sentiment === 'negative' || t.sentiment === 'angry'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(148, 163, 184, 0.2)',
                      color:
                        t.sentiment === 'positive'
                          ? '#10b981'
                          : t.sentiment === 'negative' || t.sentiment === 'angry'
                            ? '#ef4444'
                            : '#94a3b8',
                    }}
                  >
                    {t.sentiment || 'neutral'}
                  </span>
                </div>

                <div style={ui.threadPreviewText}>{lastMsg}</div>

                <div style={ui.threadMetaRow}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{t.phone}</span>
                    {t.deliveryLocation && (
                      <span
                        style={{
                          fontSize: 10,
                          background: t.deliveryLocation.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: t.deliveryLocation.verified ? '#34d399' : '#fbbf24',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        📍 {t.deliveryLocation.verified ? 'Mapped' : 'Need PIN'}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      ...ui.badgeTag,
                      background: t.status === 'open' ? '#3b82f6' : t.status === 'review' ? '#f59e0b' : '#10b981',
                    }}
                  >
                    {t.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Chat Panel */}
      <div style={ui.chatPanel}>
        {!selectedThread ? (
          <div style={ui.noChatSelected}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>✨</div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 18 }}>Select a Conversation</h3>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 6, maxWidth: 360, textAlign: 'center' }}>
              Choose any client chat from the sidebar to review live messages, send human replies, or monitor AI responses.
            </p>
          </div>
        ) : (
          <>
            {/* Chat Top Banner */}
            <div style={ui.chatTopBanner}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc', fontWeight: 700 }}>
                  {selectedThread.customerProfile?.vip && '⭐ '}
                  {selectedThread.name}
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>{selectedThread.phone}</span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onAction('takeover', { threadId: selectedThread.id })}
                  style={{
                    ...ui.smallActionBtn,
                    background: selectedThread.takeover ? '#dc2626' : '#2563eb',
                  }}
                >
                  {selectedThread.takeover ? '🤖 Resume AI' : '👤 Take Over'}
                </button>
                <button
                  onClick={() => onAction('resolve', { threadId: selectedThread.id })}
                  style={{ ...ui.smallActionBtn, background: '#16a34a' }}
                >
                  ✓ Mark Resolved
                </button>
              </div>
            </div>

            {/* Delivery Location & Map Card if Address Detected */}
            {selectedThread.deliveryLocation && (
              <div
                style={{
                  background: selectedThread.deliveryLocation.verified
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.25))'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(120, 53, 15, 0.25))',
                  borderBottom: `1px solid ${
                    selectedThread.deliveryLocation.verified ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                  }`,
                  padding: '12px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 22 }}>
                      {selectedThread.deliveryLocation.verified ? '📍' : '⚠️'}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: selectedThread.deliveryLocation.verified ? '#34d399' : '#fbbf24',
                          }}
                        >
                          {selectedThread.deliveryLocation.verified
                            ? 'DELIVERY LOCATION MAPPED & VERIFIED'
                            : 'DELIVERY ADDRESS DETECTED · PIN CODE REQUIRED'}
                        </span>
                        {selectedThread.deliveryLocation.pincode && (
                          <span
                            style={{
                              background: '#047857',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                            }}
                          >
                            PIN: {selectedThread.deliveryLocation.pincode}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#f1f5f9', fontSize: 13, marginTop: 3, fontWeight: 500 }}>
                        {selectedThread.deliveryLocation.raw}
                      </div>
                      {selectedThread.deliveryLocation.lat && selectedThread.deliveryLocation.lng && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                          GPS: {selectedThread.deliveryLocation.lat.toFixed(4)}° N,{' '}
                          {selectedThread.deliveryLocation.lng.toFixed(4)}° E
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selectedThread.deliveryLocation && (
                      <a
                        href={getGoogleMapsSearchUrl(selectedThread.deliveryLocation)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: '#2563eb',
                          color: '#fff',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        🗺️ Google Maps
                      </a>
                    )}
                    {selectedThread.deliveryLocation && (
                      <a
                        href={getGoogleMapsDirectionsUrl(selectedThread.deliveryLocation)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: '#059669',
                          color: '#fff',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        🛵 Rider Route
                      </a>
                    )}
                    <button
                      onClick={() => {
                        const loc = selectedThread.deliveryLocation!;
                        const text = `DELIVERY SLIP\nRecipient: ${selectedThread.name} (${selectedThread.phone})\nAddress: ${loc.raw}\nPIN: ${loc.pincode || 'MISSING'}\nGPS: ${loc.lat || ''}, ${loc.lng || ''}\nMaps: ${loc.mapUrl || ''}\nRider Route: ${loc.directionsUrl || ''}`;
                        navigator.clipboard?.writeText(text);
                        alert('Delivery slip copied to clipboard!');
                      }}
                      style={{
                        background: '#334155',
                        color: '#f8fafc',
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #475569',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      📋 Copy Slip
                    </button>
                  </div>
                </div>

                {/* Embedded Interactive Map Preview if coordinates exist */}
                {selectedThread.deliveryLocation.lat && selectedThread.deliveryLocation.lng && (
                  <div
                    style={{
                      borderRadius: 8,
                      overflow: 'hidden',
                      height: 160,
                      border: '1px solid rgba(255,255,255,0.1)',
                      marginTop: 4,
                    }}
                  >
                    <iframe
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      style={{ border: 0, width: '100%', height: '100%' }}
                      src={`https://www.google.com/maps?q=${encodeURIComponent(
                        selectedThread.deliveryLocation.raw.includes('1302')
                          ? '1302, Sathgalli Layout, Mysuru, Karnataka'
                          : selectedThread.deliveryLocation.formattedAddress || selectedThread.deliveryLocation.raw
                      )}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Message Stream */}
            <div ref={messagesAreaRef} style={ui.messagesArea}>
              {selectedThread.messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    ...ui.msgBubble,
                    ...(m.role === 'outgoing' ? ui.msgOutgoing : ui.msgIncoming),
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>
                  <div style={ui.msgTime}>
                    {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {m.role === 'outgoing' && ' · ✓✓'}
                  </div>
                </div>
              ))}
            </div>

            {/* AI Draft Review Banner if Approval is On */}
            {selectedThread.draft && (
              <div style={ui.draftBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>📝 AI CONSULTATIVE DRAFT</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => onAction('approve-thread', { threadId: selectedThread.id })}
                      style={{ ...ui.smallActionBtn, background: '#10b981', padding: '4px 12px' }}
                    >
                      ✓ Approve & Send
                    </button>
                    <button
                      onClick={() => onAction('edit-draft', { threadId: selectedThread.id, draft: '' })}
                      style={{ ...ui.smallActionBtn, background: '#475569', padding: '4px 10px' }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
                <div style={{ color: '#f1f5f9', fontSize: 13, lineHeight: 1.4 }}>{selectedThread.draft}</div>
              </div>
            )}

            {/* Bottom Reply Bar */}
            <div style={ui.replyInputBar}>
              <button
                onClick={() => setShowQuick(!showQuick)}
                style={ui.quickReplyBtn}
                title="Quick Product & Policy Replies"
              >
                ⚡
              </button>

              <input
                type="text"
                placeholder={`Reply to ${selectedThread.name} as ${settings.profile?.name || 'Titan Watches'}...`}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualText.trim()) {
                    onAction('send-manual', { threadId: selectedThread.id, text: manualText.trim() });
                    setManualText('');
                  }
                }}
                style={ui.inputField}
              />

              <button
                onClick={() => {
                  if (manualText.trim()) {
                    onAction('send-manual', { threadId: selectedThread.id, text: manualText.trim() });
                    setManualText('');
                  }
                }}
                style={ui.sendBtn}
              >
                Send ➤
              </button>
            </div>

            {/* Quick Replies Drawer */}
            {showQuick && (
              <div style={ui.quickDrawer}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
                  ⚡ QUICK RESPONSES & WATCH SPECS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {(settings.quickReplies || []).map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => {
                        onAction('send-manual', { threadId: selectedThread.id, text: qr.text });
                        setShowQuick(false);
                      }}
                      style={ui.quickChip}
                    >
                      <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 12 }}>{qr.label}</div>
                      <div style={{ color: '#94a3b8', fontSize: 11, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {qr.text}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════
// ── PRODUCTS & CATALOG VIEW ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function CatalogView({
  catalog,
  onSave,
}: {
  catalog: CatalogItem[];
  onSave: (cat: CatalogItem[]) => void;
}) {
  const [items, setItems] = useState<CatalogItem[]>(catalog || titanWatchesCatalog);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState<Partial<CatalogItem>>({
    name: '',
    category: 'Watches',
    price: 9999,
    mrp: 11999,
    currency: 'INR',
    description: '',
    features: [],
    inStock: true,
  });

  const toggleStock = (id: string) => {
    const updated = items.map((it) => (it.id === id ? { ...it, inStock: !it.inStock } : it));
    setItems(updated);
    onSave(updated);
  };

  const addItem = () => {
    if (!newItem.name || !newItem.price) return;
    const item: CatalogItem = {
      id: newItem.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: newItem.name,
      category: newItem.category || 'Watches',
      price: Number(newItem.price),
      mrp: newItem.mrp ? Number(newItem.mrp) : undefined,
      currency: 'INR',
      description: newItem.description || '',
      features: newItem.features?.length ? newItem.features : ['Premium Craftsmanship', 'Official Warranty'],
      inStock: true,
    };
    const updated = [item, ...items];
    setItems(updated);
    onSave(updated);
    setShowAddModal(false);
    setNewItem({ name: '', category: 'Watches', price: 9999, description: '', features: [], inStock: true });
  };

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc', fontWeight: 800 }}>🛍️ Product & Watch Catalog</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            The AI refers to this exact live catalog to quote prices, highlight specifications, and suggest matching products to customers.
          </p>
        </div>

        <button onClick={() => setShowAddModal(true)} style={ui.primaryBtn}>
          + Add Product / Watch
        </button>
      </div>

      <div style={ui.catalogGrid}>
        {items.map((watch) => (
          <div key={watch.id} style={ui.productCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={ui.categoryTag}>{watch.category}</span>
              {watch.bestseller && <span style={ui.bestsellerTag}>⭐ BESTSELLER</span>}
            </div>

            <div style={ui.watchName}>{watch.name}</div>
            <div style={ui.watchDesc}>{watch.description}</div>

            <div style={ui.priceRow}>
              <div style={ui.watchPrice}>₹{watch.price.toLocaleString('en-IN')}</div>
              {watch.mrp && <div style={ui.watchMrp}>₹{watch.mrp.toLocaleString('en-IN')}</div>}
            </div>

            <div style={ui.featureList}>
              {watch.features.map((f, i) => (
                <span key={i} style={ui.featureChip}>
                  ✓ {f}
                </span>
              ))}
            </div>

            <div style={ui.stockActionRow}>
              <span style={{ fontSize: 12, color: watch.inStock ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {watch.inStock ? '● In Stock' : '○ Out of Stock'}
              </span>
              <button
                onClick={() => toggleStock(watch.id)}
                style={{
                  ...ui.stockToggleBtn,
                  background: watch.inStock ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: watch.inStock ? '#10b981' : '#ef4444',
                }}
              >
                {watch.inStock ? 'Toggle Out of Stock' : 'Mark Available'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div style={ui.modalOverlay}>
          <div style={ui.modalCard}>
            <h3 style={{ margin: '0 0 16px', color: '#f8fafc', fontSize: 18 }}>+ Add Watch / Product to Catalog</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={ui.fieldLabel}>Product / Watch Name</label>
                <input
                  type="text"
                  placeholder="e.g. Titan Edge Ceramic Blue Dial"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  style={ui.inputField}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={ui.fieldLabel}>Selling Price (₹)</label>
                  <input
                    type="number"
                    placeholder="29995"
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                    style={ui.inputField}
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>MRP (Optional ₹)</label>
                  <input
                    type="number"
                    placeholder="32000"
                    value={newItem.mrp || ''}
                    onChange={(e) => setNewItem({ ...newItem, mrp: Number(e.target.value) })}
                    style={ui.inputField}
                  />
                </div>
              </div>

              <div>
                <label style={ui.fieldLabel}>Category</label>
                <input
                  type="text"
                  placeholder="Luxury, Women, Smartwatch, Automatic, etc."
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  style={ui.inputField}
                />
              </div>

              <div>
                <label style={ui.fieldLabel}>Brief Description</label>
                <textarea
                  rows={2}
                  placeholder="Highlight features like sapphire glass, ceramic build, or diamond markers..."
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  style={ui.inputField}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button onClick={() => setShowAddModal(false)} style={ui.secondaryBtn}>
                  Cancel
                </button>
                <button onClick={addItem} style={ui.primaryBtn}>
                  Save to Live Catalog
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════
// ── STORE & BUSINESS PROFILE ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function BusinessSettingsView({
  settings,
  onSave,
}: {
  settings: WASettings;
  onSave: (s: WASettings) => void;
}) {
  const [form, setForm] = useState<WASettings>(settings);

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc', fontWeight: 800 }}>🏢 Store Profile & Policies</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            Configure your brand identity, store hours, warranty, shipping, and active discount vouchers.
          </p>
        </div>
        <button onClick={() => onSave(form)} style={ui.primaryBtn}>
          💾 Save Changes
        </button>
      </div>

      <div style={ui.settingsGrid}>
        <div style={ui.settingsCard}>
          <h4 style={ui.cardSectionHeader}>Brand Identity</h4>
          <div style={ui.formRow}>
            <label style={ui.fieldLabel}>Business / Store Name</label>
            <input
              type="text"
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              style={ui.inputField}
            />
          </div>
          <div style={ui.formRow}>
            <label style={ui.fieldLabel}>Tagline</label>
            <input
              type="text"
              value={form.tagline || ''}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              style={ui.inputField}
            />
          </div>
          <div style={ui.formRow}>
            <label style={ui.fieldLabel}>Website</label>
            <input
              type="text"
              value={form.website || ''}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              style={ui.inputField}
            />
          </div>
        </div>

        <div style={ui.settingsCard}>
          <h4 style={ui.cardSectionHeader}>Store Hours & Address</h4>
          <div style={ui.formRow}>
            <label style={ui.fieldLabel}>Operating Hours (e.g. 09:00-22:00)</label>
            <input
              type="text"
              value={form.businessHours}
              onChange={(e) => setForm({ ...form, businessHours: e.target.value })}
              style={ui.inputField}
            />
          </div>
          <div style={ui.formRow}>
            <label style={ui.fieldLabel}>Flagship Store Locations / Address</label>
            <input
              type="text"
              value={form.storeAddress || ''}
              onChange={(e) => setForm({ ...form, storeAddress: e.target.value })}
              style={ui.inputField}
            />
          </div>
          <div style={ui.formRow}>
            <label style={ui.fieldLabel}>Support Phone / Helpline</label>
            <input
              type="text"
              value={form.supportPhone || ''}
              onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
              style={ui.inputField}
            />
          </div>
        </div>

        <div style={{ ...ui.settingsCard, gridColumn: '1 / -1' }}>
          <h4 style={ui.cardSectionHeader}>Commercial Policies & Privilege Codes</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={ui.formRow}>
              <label style={ui.fieldLabel}>Active Promo / Discount Code</label>
              <input
                type="text"
                value={form.discountCode || ''}
                onChange={(e) => setForm({ ...form, discountCode: e.target.value })}
                style={ui.inputField}
              />
            </div>
            <div style={ui.formRow}>
              <label style={ui.fieldLabel}>Discount Details / Privilege Offer</label>
              <input
                type="text"
                value={form.discountOffer || ''}
                onChange={(e) => setForm({ ...form, discountOffer: e.target.value })}
                style={ui.inputField}
              />
            </div>
            <div style={ui.formRow}>
              <label style={ui.fieldLabel}>Warranty & Guarantee Policy</label>
              <textarea
                rows={2}
                value={form.warrantyPolicy || ''}
                onChange={(e) => setForm({ ...form, warrantyPolicy: e.target.value })}
                style={ui.inputField}
              />
            </div>
            <div style={ui.formRow}>
              <label style={ui.fieldLabel}>Delivery & Shipping Policy</label>
              <textarea
                rows={2}
                value={form.shippingPolicy || ''}
                onChange={(e) => setForm({ ...form, shippingPolicy: e.target.value })}
                style={ui.inputField}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════
// ── AI BEHAVIOR & HUMAN TEXTING SETTINGS ────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function AIBrainSettingsView({
  settings,
  onSave,
}: {
  settings: WASettings;
  onSave: (s: WASettings) => void;
}) {
  const [form, setForm] = useState<WASettings>(settings);

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc', fontWeight: 800 }}>🧠 AI Thinking & Human Texting Engine</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            Tailor the consultative intelligence, response length, typing simulations, and tone mirroring.
          </p>
        </div>
        <button onClick={() => onSave(form)} style={ui.primaryBtn}>
          💾 Save Settings
        </button>
      </div>

      <div style={ui.settingsGrid}>
        {/* Language & Casual Hinglish Mode */}
        <div style={{ ...ui.settingsCard, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h4 style={ui.cardSectionHeader}>🌐 AI Conversational Language & Mode</h4>
            <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
              Active: {form.language === 'Hinglish' ? 'Casual Hinglish' : form.language === 'English' ? 'English' : form.language === 'Hindi' ? 'Hindi' : 'Auto-Detect'}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
            Control whether the AI speaks in English, pure Hindi, or casually starts talking in natural, stylish Hinglish even if the customer texted in English.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
            {[
              {
                id: 'Hinglish',
                icon: '🇮🇳',
                title: 'Hinglish (Casual & Chic)',
                badge: 'Recommended',
                desc: 'Always converses casually in natural, stylish Hinglish ("Haanji bilkul", "Main check karti hu ✨") even if customer texted in English.',
              },
              {
                id: 'English',
                icon: '🇬🇧',
                title: 'English (Polished Luxury)',
                desc: 'Speaks 100% in refined, professional luxury English for all international and corporate clients.',
              },
              {
                id: 'Hindi',
                icon: '🕉️',
                title: 'Hindi (हिंदी)',
                desc: 'Converses respectfully in polite, graceful conversational Hindi.',
              },
              {
                id: 'auto',
                icon: '⚡',
                title: 'Auto-Detect (Adaptive)',
                desc: 'Mirrors whatever language the customer uses (Hinglish or English).',
              },
            ].map((lang) => {
              const isSelected = (form.language || 'auto') === lang.id;
              return (
                <div
                  key={lang.id}
                  onClick={() => setForm({ ...form, language: lang.id as any })}
                  style={{
                    ...ui.presetOption,
                    border: isSelected ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.06)',
                    background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: isSelected ? '#10b981' : '#f8fafc', fontSize: 13 }}>
                      {lang.icon} {lang.title}
                    </div>
                    {lang.badge && (
                      <span style={{ fontSize: 9, background: '#10b981', color: '#0f172a', fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>
                        {lang.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{lang.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reply Length Presets */}
        <div style={ui.settingsCard}>
          <h4 style={ui.cardSectionHeader}>Agent Response Length</h4>
          <p style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
            Choose how much detail your concierge gives in each WhatsApp message.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { id: 1, title: 'Concise (1 Sentence)', desc: 'Under 15 words. Ultra-direct and fast.' },
              { id: 2, title: 'Friendly Balanced (1-2 Sentences)', desc: 'Clean, approachable, and straight to the point.' },
              { id: 3, title: 'Detailed Horology (2-3 Sentences)', desc: 'Includes technical specs, movements, and case details.' },
              { id: 4, title: 'Adaptive Consultative (Recommended)', desc: 'Matches customer depth, quotes exact prices, and asks a helpful closing question.' },
            ].map((p) => (
              <div
                key={p.id}
                onClick={() => setForm({ ...form, length: p.id })}
                style={{
                  ...ui.presetOption,
                  border: form.length === p.id ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.06)',
                  background: form.length === p.id ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                }}
              >
                <div style={{ fontWeight: 600, color: form.length === p.id ? '#10b981' : '#f8fafc', fontSize: 13 }}>
                  {p.title}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Human Simulation Settings */}
        <div style={ui.settingsCard}>
          <h4 style={ui.cardSectionHeader}>Human Behavior & Anti-Bot Signals</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={ui.toggleRow}>
              <div>
                <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 600 }}>WhatsApp "Typing..." Indicator</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>Simulates live typing state before sending.</div>
              </div>
              <input
                type="checkbox"
                checked={form.typingIndicator !== false}
                onChange={(e) => setForm({ ...form, typingIndicator: e.target.checked })}
                style={{ width: 20, height: 20, accentColor: '#10b981' }}
              />
            </div>

            <div style={ui.toggleRow}>
              <div>
                <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 600 }}>Read Receipts (Blue Ticks)</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>Marks message as read upon receiving.</div>
              </div>
              <input
                type="checkbox"
                checked={form.readReceipts !== false}
                onChange={(e) => setForm({ ...form, readReceipts: e.target.checked })}
                style={{ width: 20, height: 20, accentColor: '#10b981' }}
              />
            </div>

            <div style={ui.toggleRow}>
              <div>
                <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 600 }}>Require Manual Approval Before Sending</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>If ON, replies wait in inbox as review drafts.</div>
              </div>
              <input
                type="checkbox"
                checked={!!form.approval}
                onChange={(e) => setForm({ ...form, approval: e.target.checked })}
                style={{ width: 20, height: 20, accentColor: '#10b981' }}
              />
            </div>

            <div>
              <label style={ui.fieldLabel}>Simulated Typing Delay (Seconds)</label>
              <input
                type="number"
                min={0}
                max={15}
                value={form.personalReplyDelaySeconds || 3}
                onChange={(e) => setForm({ ...form, personalReplyDelaySeconds: Number(e.target.value) })}
                style={ui.inputField}
              />
            </div>
          </div>
        </div>

        {/* Custom Instructions */}
        <div style={{ ...ui.settingsCard, gridColumn: '1 / -1' }}>
          <h4 style={ui.cardSectionHeader}>Specialized Concierge Guidelines</h4>
          <textarea
            rows={4}
            value={form.instructions || ''}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder="Add custom brand instructions, specific watch handling, corporate discounts..."
            style={ui.inputField}
          />
        </div>
      </div>
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════
// ── ANALYTICS VIEW ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function AnalyticsView({
  analytics,
  threads,
}: {
  analytics: WAAnalytics;
  threads: WAThread[];
}) {
  return (
    <div style={{ padding: '24px 32px' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, color: '#f8fafc', fontWeight: 800 }}>📊 Live Performance & Leads</h2>

      <div style={ui.statsGrid}>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>💬</div>
          <div style={ui.statBigNum}>{threads.length}</div>
          <div style={ui.statSub}>Total Client Inquiries</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🔥</div>
          <div style={{ ...ui.statBigNum, color: '#f59e0b' }}>
            {threads.filter((t) => t.tags.includes('hot_lead') || t.tags.includes('order_inquiry')).length}
          </div>
          <div style={ui.statSub}>High Intent / Ready to Buy</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>⭐</div>
          <div style={{ ...ui.statBigNum, color: '#10b981' }}>
            {threads.filter((t) => t.customerProfile?.vip || t.tags.includes('luxury_buyer')).length}
          </div>
          <div style={ui.statSub}>Luxury / VIP Clients</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>⚡</div>
          <div style={{ ...ui.statBigNum, color: '#3b82f6' }}>0.8s</div>
          <div style={ui.statSub}>Average AI Decision Speed</div>
        </div>
      </div>
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════
// ── WHATSAPP DEVICE LINK VIEW ───────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function ConnectView({
  waStatus,
  onAction,
  onRefresh,
}: {
  waStatus: any;
  onAction: (act: string, body?: any) => Promise<void>;
  onRefresh: () => void;
}) {
  const [connecting, setConnecting] = useState(false);

  const isConnected = waStatus?.state === 'connected';
  const hasQR = waStatus?.state === 'qr' && waStatus?.qrDataUrl;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: 650, margin: '0 auto' }}>
      <div style={ui.connectCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>📱</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>WhatsApp Linked Device</h3>
            <span style={{ fontSize: 13, color: isConnected ? '#10b981' : '#94a3b8' }}>
              {isConnected ? `✓ Linked to +${waStatus.connectedPhone}` : 'Scan QR code to link device'}
            </span>
          </div>
        </div>

        {isConnected ? (
          <div style={ui.linkedBox}>
            <div style={{ color: '#10b981', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              🟢 Live & Listening to Customer Chats
            </div>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
              Device is authenticated as <strong>+{waStatus.connectedPhone}</strong>. Incoming customer queries will
              automatically trigger the Titan Watches Concierge engine.
            </p>
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => onAction('disconnect')}
                style={{ ...ui.smallActionBtn, background: '#dc2626', padding: '8px 18px' }}
              >
                Disconnect Device
              </button>
            </div>
          </div>
        ) : hasQR ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 16, marginBottom: 16 }}>
              <img src={waStatus.qrDataUrl} alt="WhatsApp QR Code" style={{ width: 260, height: 260 }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>Scan with WhatsApp on your Phone</div>
            <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', maxWidth: 360, marginTop: 4 }}>
              Open WhatsApp → Settings → Linked Devices → Link a Device → Point your camera at this QR code.
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>
              Connect your WhatsApp business number without Meta Developer approval. Just scan once like WhatsApp Web.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              style={{ ...ui.primaryBtn, padding: '12px 32px', fontSize: 15 }}
            >
              {connecting ? '⏳ Preparing QR Code...' : '📱 Link WhatsApp Device'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════
// ── ONBOARDING / BUSINESS SWITCHER MODAL ────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function BusinessSetupModal({
  settings,
  onClose,
  onSave,
}: {
  settings: WASettings;
  onClose: () => void;
  onSave: (s: WASettings) => void;
}) {
  const [bName, setBName] = useState(settings.businessName);
  const [bDesc, setBDesc] = useState(settings.businessDescription);
  const [bHours, setBHours] = useState(settings.businessHours);
  const [agentName, setAgentName] = useState(settings.profile?.name || 'Nina Kurain');

  return (
    <div style={ui.modalOverlay}>
      <div style={ui.modalCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 18 }}>🏢 Configure Business Identity</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          Change this WhatsApp bot to represent <strong>any business</strong> (Watches, Boutique, Clinic, Real Estate, Agency).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={ui.fieldLabel}>Business / Brand Name</label>
            <input
              type="text"
              value={bName}
              onChange={(e) => setBName(e.target.value)}
              placeholder="e.g. Titan Watches, Zudio, Urban Studio"
              style={ui.inputField}
            />
          </div>

          <div>
            <label style={ui.fieldLabel}>Concierge / Agent Name</label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Nina Kurain"
              style={ui.inputField}
            />
          </div>

          <div>
            <label style={ui.fieldLabel}>Operating Hours</label>
            <input
              type="text"
              value={bHours}
              onChange={(e) => setBHours(e.target.value)}
              placeholder="09:00-22:00"
              style={ui.inputField}
            />
          </div>

          <div>
            <label style={ui.fieldLabel}>Business Summary & Description</label>
            <textarea
              rows={3}
              value={bDesc}
              onChange={(e) => setBDesc(e.target.value)}
              placeholder="What does your business sell, what are the price ranges, warranty, etc..."
              style={ui.inputField}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={onClose} style={ui.secondaryBtn}>
              Cancel
            </button>
            <button
              onClick={() => {
                onSave({
                  ...settings,
                  businessName: bName,
                  businessDescription: bDesc,
                  businessHours: bHours,
                  profile: {
                    ...(settings.profile || {}),
                    name: agentName,
                    role: `${bName} Client Advisor`,
                    bio: `Professional customer concierge for ${bName}.`,
                    denyAi: true,
                    gender: 'female',
                  },
                });
              }}
              style={ui.primaryBtn}
            >
              Apply to WhatsApp Engine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ── ORDERS & LIVE DELIVERY MAP VIEW ──────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function OrdersAndMapView({
  orders,
  threads,
  catalog,
  onAction,
  onJumpToChat,
}: {
  orders: WAOrder[];
  threads: WAThread[];
  catalog: CatalogItem[];
  onAction: (act: string, body?: any) => void;
  onJumpToChat: (threadId: string) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(orders[0]?.id || '');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Tracking edit state: orderId -> { courier, tracking }
  const [trackingEdits, setTrackingEdits] = useState<Record<string, { courier: string; tracking: string }>>({});

  // New Order Modal Form
  const [newCustName, setNewCustName] = useState('Ananya Sharma');
  const [newCustPhone, setNewCustPhone] = useState('+91 96206 42109');
  const [newProduct, setNewProduct] = useState(catalog[0]?.name || 'Titan Edge Ceramic Midnight Black');
  const [newAmount, setNewAmount] = useState(catalog[0]?.price || 29995);
  const [newAddress, setNewAddress] = useState('#1302 Rajkumar Main Road, Sathgalli, Mysore');
  const [newPin, setNewPin] = useState('570019');
  const [newPayment, setNewPayment] = useState<'COD' | 'UPI'>('COD');

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  // Active coordinates for map display
  const mapLat = selectedOrder?.deliveryLocation?.lat || 12.3321;
  const mapLng = selectedOrder?.deliveryLocation?.lng || 76.6987;

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (filter === 'ready' && o.orderStatus !== 'ready_for_dispatch') return false;
    if (filter === 'dispatched' && o.orderStatus !== 'dispatched' && o.orderStatus !== 'out_for_delivery') return false;
    if (filter === 'delivered' && o.orderStatus !== 'delivered') return false;
    if (filter === 'needs_pin' && !o.deliveryLocation?.pincodeMissing) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        (o.deliveryLocation?.raw || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalRevenue = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
  const readyCount = orders.filter((o) => o.orderStatus === 'ready_for_dispatch').length;
  const dispatchedCount = orders.filter((o) => o.orderStatus === 'dispatched' || o.orderStatus === 'out_for_delivery').length;
  const missingPinCount = orders.filter((o) => o.deliveryLocation?.pincodeMissing).length;

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc', fontWeight: 800 }}>
              📦 Confirmed Orders & Live Delivery Radar
            </h2>
            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>
              GPS Geocoded & Mapped
            </span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            Central hub to track all client orders, verified street addresses, 6-digit PIN verification, and rider delivery routes.
          </p>
        </div>

        <button onClick={() => setShowCreateModal(true)} style={ui.primaryBtn}>
          + Create Manual Order
        </button>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={ui.statCard}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Orders</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>{orders.length}</div>
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>₹{totalRevenue.toLocaleString('en-IN')} Total Value</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Ready for Dispatch</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>{readyCount}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Address & PIN Verified</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>In Transit / Dispatched</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#60a5fa', marginTop: 4 }}>{dispatchedCount}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>With Courier Partner</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Missing PIN Code</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: missingPinCount > 0 ? '#f59e0b' : '#64748b', marginTop: 4 }}>
            {missingPinCount}
          </div>
          <div style={{ fontSize: 12, color: missingPinCount > 0 ? '#fbbf24' : '#64748b', marginTop: 2 }}>
            {missingPinCount > 0 ? 'Action required from client' : 'All addresses valid'}
          </div>
        </div>
      </div>

      {/* Live Map & Active Order Radar Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 16,
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 24,
        }}
      >
        {/* Left: Embedded Google Map */}
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', minHeight: 280, border: '1px solid rgba(255,255,255,0.1)' }}>
          <iframe
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 0, width: '100%', height: '100%', minHeight: 280 }}
            src={`https://www.google.com/maps?q=${encodeURIComponent(
              selectedOrder?.deliveryLocation?.raw?.includes('1302')
                ? '1302, Sathgalli Layout, Mysuru, Karnataka'
                : selectedOrder?.deliveryLocation?.formattedAddress || selectedOrder?.deliveryLocation?.raw || '1302, Sathgalli Layout, Mysuru, Karnataka'
            )}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
            allowFullScreen
            loading="lazy"
          />
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            📍 Live GPS Radar · {selectedOrder ? selectedOrder.id : 'Mysore Central'}
          </div>
        </div>

        {/* Right: Selected Order Detail Radar */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {selectedOrder ? (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                      {selectedOrder.id} · {selectedOrder.orderStatus.replace(/_/g, ' ')}
                    </span>
                    <h3 style={{ margin: '4px 0 0', fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                      {selectedOrder.customerName}
                    </h3>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{selectedOrder.customerPhone}</div>
                  </div>

                  <span
                    style={{
                      background: selectedOrder.deliveryLocation?.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: selectedOrder.deliveryLocation?.verified ? '#34d399' : '#fbbf24',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 6,
                    }}
                  >
                    {selectedOrder.deliveryLocation?.verified ? '✅ PIN VERIFIED' : '⚠️ PIN MISSING'}
                  </span>
                </div>

                {/* Product & Payment */}
                <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 8, padding: 12, margin: '14px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: 14 }}>{selectedOrder.productName}</span>
                    <span style={{ fontWeight: 800, color: '#34d399', fontSize: 16 }}>
                      ₹{selectedOrder.amount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* If bulk order with itemized list */}
                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                        📦 Itemized Timepieces ({selectedOrder.quantity || selectedOrder.items.length} units):
                      </div>
                      {selectedOrder.items.map((it, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', padding: '2px 0' }}>
                          <span>• {it.productName} × {it.quantity}</span>
                          <span style={{ color: '#34d399', fontWeight: 600 }}>₹{it.totalPrice.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {selectedOrder.subtotal && selectedOrder.discountAmount ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fbbf24', marginTop: 4, borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: 4 }}>
                          <span>Subtotal: ₹{selectedOrder.subtotal.toLocaleString('en-IN')}</span>
                          <span>VIP {selectedOrder.discountCode || 'TITAN10'}: −₹{selectedOrder.discountAmount.toLocaleString('en-IN')}</span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
                    <span>Payment: <b style={{ color: '#f1f5f9' }}>{selectedOrder.paymentMode}</b> ({selectedOrder.paymentStatus})</span>
                    {selectedOrder.discountCode && <span>Promo: <b style={{ color: '#fbbf24' }}>{selectedOrder.discountCode}</b></span>}
                    {selectedOrder.courierPartner && <span>Courier: <b style={{ color: '#60a5fa' }}>{selectedOrder.courierPartner}</b></span>}
                  </div>
                </div>

                {/* Delivery Address & GPS Coordinates */}
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                    Delivery Address & GPS Coordinates
                  </div>
                  <div style={{ color: '#f8fafc', fontWeight: 500 }}>
                    {selectedOrder.deliveryLocation?.raw || 'Address pending'}
                  </div>
                  {selectedOrder.deliveryLocation?.pincode && (
                    <div style={{ color: '#34d399', fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                      📮 Postal PIN Code: {selectedOrder.deliveryLocation.pincode}
                    </div>
                  )}
                  {selectedOrder.deliveryLocation?.lat && (
                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                      🧭 GPS: {selectedOrder.deliveryLocation.lat.toFixed(4)}° N, {selectedOrder.deliveryLocation.lng?.toFixed(4)}° E
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {selectedOrder.deliveryLocation && (
                  <a
                    href={getGoogleMapsSearchUrl(selectedOrder.deliveryLocation)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    🗺️ Google Maps
                  </a>
                )}
                {selectedOrder.deliveryLocation && (
                  <a
                    href={getGoogleMapsDirectionsUrl(selectedOrder.deliveryLocation)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: '#059669',
                      color: '#fff',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    🛵 Rider Route
                  </a>
                )}
                <button
                  onClick={() => {
                    const loc = selectedOrder.deliveryLocation;
                    const text = `DELIVERY DISPATCH SLIP\nOrder ID: ${selectedOrder.id}\nRecipient: ${selectedOrder.customerName} (${selectedOrder.customerPhone})\nItem: ${selectedOrder.productName} (₹${selectedOrder.amount})\nPayment: ${selectedOrder.paymentMode} (${selectedOrder.paymentStatus})\nAddress: ${loc?.raw || ''}\nPIN: ${loc?.pincode || 'MISSING'}\nGPS: ${loc?.lat || ''}, ${loc?.lng || ''}\nGoogle Maps: ${loc?.mapUrl || ''}\nRider Route: ${loc?.directionsUrl || ''}`;
                    navigator.clipboard?.writeText(text);
                    alert('Delivery slip copied to clipboard!');
                  }}
                  style={{
                    background: '#334155',
                    color: '#f8fafc',
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: '1px solid #475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  📋 Copy Slip
                </button>
                <button
                  onClick={() => onJumpToChat(selectedOrder.threadId)}
                  style={{
                    background: '#0f766e',
                    color: '#f8fafc',
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  💬 Open Chat
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
              <p>No orders yet. When a customer shares their address or confirms a watch, it will appear here automatically.</p>
            </div>
          )}
        </div>
      </div>

      {/* Orders Filter & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'ready', label: 'Ready for Dispatch' },
            { id: 'dispatched', label: 'In Transit' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'needs_pin', label: '⚠️ Needs PIN' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                ...ui.filterBtn,
                ...(filter === f.id ? ui.filterBtnActive : {}),
                fontSize: 12,
                padding: '6px 14px',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, phone, address, watch..."
          style={{ ...ui.inputField, width: 280, fontSize: 12, padding: '7px 12px' }}
        />
      </div>

      {/* Orders List / Table */}
      {filteredOrders.length === 0 ? (
        <div style={{ ...ui.settingsCard, textAlign: 'center', padding: 40, color: '#64748b' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
          <h4 style={{ margin: 0, color: '#f8fafc' }}>No orders found</h4>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            Click &quot;+ Create Manual Order&quot; to log a test delivery for #1302 Rajkumar Main Road, Sathgalli, Mysore.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredOrders.map((ord) => {
            const isSelected = selectedOrderId === ord.id;
            const currentEdit = trackingEdits[ord.id] || {
              courier: ord.courierPartner || 'BlueDart',
              tracking: ord.trackingNumber || '',
            };

            return (
              <div
                key={ord.id}
                onClick={() => setSelectedOrderId(ord.id)}
                style={{
                  background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                  border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, color: '#34d399', fontSize: 14 }}>{ord.id}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {new Date(ord.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span
                        style={{
                          background: ord.deliveryLocation?.verified ? '#065f46' : '#78350f',
                          color: ord.deliveryLocation?.verified ? '#a7f3d0' : '#fde68a',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {ord.deliveryLocation?.verified ? `PIN: ${ord.deliveryLocation.pincode}` : 'MISSING PIN'}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15, marginTop: 4 }}>
                      {ord.customerName} · <span style={{ color: '#94a3b8', fontWeight: 500 }}>{ord.customerPhone}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#34d399', fontSize: 16 }}>₹{ord.amount.toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{ord.paymentMode} ({ord.paymentStatus})</div>
                    </div>

                    <select
                      value={ord.orderStatus}
                      onChange={(e) => {
                        e.stopPropagation();
                        onAction('update-order-status', { orderId: ord.id, status: e.target.value });
                      }}
                      style={{
                        background:
                          ord.orderStatus === 'delivered'
                            ? '#065f46'
                            : ord.orderStatus === 'dispatched'
                              ? '#1e40af'
                              : '#334155',
                        color: '#f8fafc',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="ready_for_dispatch">Ready for Dispatch</option>
                      <option value="dispatched">Dispatched</option>
                      <option value="out_for_delivery">Out for Delivery</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* Watch & Delivery Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30, 41, 59, 0.3)', padding: '8px 12px', borderRadius: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                    🛍️ <b style={{ color: '#f8fafc' }}>{ord.productName}</b>
                    {ord.quantity && ord.quantity > 1 && (
                      <span style={{ marginLeft: 8, background: '#d97706', color: '#000', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
                        {ord.quantity} WATCHES
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    📍 <span>{ord.deliveryLocation?.raw}</span>
                  </div>
                </div>

                {/* Dispatch Controls Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select
                      value={currentEdit.courier}
                      onChange={(e) => {
                        e.stopPropagation();
                        setTrackingEdits({ ...trackingEdits, [ord.id]: { ...currentEdit, courier: e.target.value } });
                      }}
                      style={{ ...ui.inputField, width: 130, padding: '5px 8px', fontSize: 11 }}
                    >
                      <option value="BlueDart">BlueDart Express</option>
                      <option value="Delhivery">Delhivery</option>
                      <option value="DTDC">DTDC Air</option>
                      <option value="Dunzo">Dunzo</option>
                      <option value="Porter">Porter</option>
                      <option value="Standard Express">Standard Express</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Courier AWB Tracking #"
                      value={currentEdit.tracking}
                      onChange={(e) => {
                        e.stopPropagation();
                        setTrackingEdits({ ...trackingEdits, [ord.id]: { ...currentEdit, tracking: e.target.value } });
                      }}
                      style={{ ...ui.inputField, width: 160, padding: '5px 8px', fontSize: 11 }}
                    />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('update-order-status', {
                          orderId: ord.id,
                          status: ord.orderStatus,
                          courierPartner: currentEdit.courier,
                          trackingNumber: currentEdit.tracking,
                        });
                      }}
                      style={{ ...ui.smallActionBtn, background: '#2563eb', padding: '5px 10px', fontSize: 11 }}
                    >
                      Save AWB
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {ord.deliveryLocation && (
                      <a
                        href={getGoogleMapsSearchUrl(ord.deliveryLocation)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...ui.smallActionBtn, background: '#1e293b', border: '1px solid #334155', color: '#60a5fa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      >
                        🗺️ Map
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToChat(ord.threadId);
                      }}
                      style={{ ...ui.smallActionBtn, background: '#1e293b', border: '1px solid #334155', color: '#34d399' }}
                    >
                      💬 Chat
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete order ${ord.id}?`)) {
                          onAction('delete-order', { orderId: ord.id });
                        }
                      }}
                      style={{ ...ui.smallActionBtn, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Order Modal */}
      {showCreateModal && (
        <div style={ui.modalOverlay}>
          <div style={{ ...ui.modalCard, maxWidth: 540 }}>
            <div style={ui.modalHeader}>
              <h3 style={ui.modalTitle}>+ Create Confirmed Order</h3>
              <button onClick={() => setShowCreateModal(false)} style={ui.modalCloseBtn}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={ui.fieldLabel}>Customer Name</label>
                  <input
                    type="text"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    style={ui.inputField}
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>WhatsApp Phone</label>
                  <input
                    type="text"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    style={ui.inputField}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                <div>
                  <label style={ui.fieldLabel}>Watch / Product</label>
                  <select
                    value={newProduct}
                    onChange={(e) => {
                      setNewProduct(e.target.value);
                      const matched = catalog.find((c) => c.name === e.target.value);
                      if (matched) setNewAmount(matched.price);
                    }}
                    style={ui.inputField}
                  >
                    {catalog.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} (₹{c.price.toLocaleString('en-IN')})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={ui.fieldLabel}>Price (₹ INR)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    style={ui.inputField}
                  />
                </div>
              </div>

              <div>
                <label style={ui.fieldLabel}>Delivery Street Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="e.g. #1302 Rajkumar Main Road, Sathgalli, Mysore"
                  style={ui.inputField}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={ui.fieldLabel}>6-Digit PIN Code</label>
                  <input
                    type="text"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="e.g. 570019"
                    style={ui.inputField}
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Payment Mode</label>
                  <select
                    value={newPayment}
                    onChange={(e) => setNewPayment(e.target.value as any)}
                    style={ui.inputField}
                  >
                    <option value="COD">Cash on Delivery (COD)</option>
                    <option value="UPI">Prepaid UPI (GPay/PhonePe)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button onClick={() => setShowCreateModal(false)} style={ui.secondaryBtn}>
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
                    const lat = 12.3321;
                    const lng = 76.6987;
                    const fullAddr = `${newAddress}${newPin ? `, PIN: ${newPin}` : ''}`;
                    const order: WAOrder = {
                      id: orderId,
                      threadId: `manual-${Date.now()}`,
                      customerName: newCustName,
                      customerPhone: newCustPhone,
                      productName: newProduct,
                      amount: newAmount,
                      currency: 'INR',
                      discountCode: 'TITAN10',
                      paymentMode: newPayment,
                      paymentStatus: newPayment === 'UPI' ? 'paid' : 'pending',
                      orderStatus: newPin ? 'ready_for_dispatch' : 'confirmed',
                      deliveryLocation: {
                        raw: fullAddr,
                        pincode: newPin || undefined,
                        pincodeMissing: !newPin,
                        hasAddressDetails: true,
                        city: 'Mysore',
                        state: 'Karnataka',
                        lat,
                        lng,
                        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`,
                        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`,
                        formattedAddress: fullAddr,
                        verified: !!newPin,
                        mappedAt: Date.now(),
                      },
                      courierPartner: 'BlueDart',
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    onAction('save-order', { order });
                    setShowCreateModal(false);
                  }}
                  style={ui.primaryBtn}
                >
                  Confirm & Geocode Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ── MODERN LUXURY UI STYLES ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const ui: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 10% 10%, #0d1a2d 0%, #080d19 45%, #03060d 100%)',
    color: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
  },

  loadingScreen: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#080d19',
  },
  spinner: {
    width: 44,
    height: 44,
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.08)',
    borderTopColor: '#10b981',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  toast: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    color: '#f8fafc',
    padding: '12px 20px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    zIndex: 9999,
    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 28px',
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  brandGroup: { display: 'flex', alignItems: 'center', gap: 14 },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
  },
  brandTitleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  brandTitle: { fontSize: 18, fontWeight: 800, color: '#f8fafc', letterSpacing: -0.3 },
  brandTagline: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 },
  changeBusinessBtn: {
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#cbd5e1',
    cursor: 'pointer',
  },

  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  connectionPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    borderRadius: 20,
    border: '1px solid transparent',
  },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  kpiPill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  kpiValue: { fontSize: 15, fontWeight: 800, color: '#f8fafc' },
  kpiLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 },

  // Nav
  nav: {
    display: 'flex',
    gap: 4,
    padding: '8px 24px',
    background: 'rgba(10, 16, 28, 0.6)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    overflowX: 'auto',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 18px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  navBtnActive: {
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    boxShadow: 'inset 0 0 0 1px rgba(16, 185, 129, 0.3)',
  },

  mainContent: { flex: 1, minHeight: 'calc(100vh - 120px)' },

  // Inbox
  inboxLayout: { display: 'flex', height: 'calc(100vh - 120px)' },
  inboxSidebar: {
    width: 360,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(11, 18, 32, 0.5)',
    display: 'flex',
    flexDirection: 'column',
  },
  searchWrapper: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  filterPillRow: { display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  statusFilterBtn: {
    padding: '4px 8px',
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 6,
    border: 'none',
    background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8',
    cursor: 'pointer',
  },
  statusFilterBtnActive: { background: '#10b981', color: '#0f172a' },
  threadScrollList: { flex: 1, overflowY: 'auto', padding: '6px' },
  emptyStateBlock: { padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center' },

  threadCard: {
    padding: '12px 14px',
    borderRadius: 10,
    cursor: 'pointer',
    marginBottom: 4,
    border: '1px solid transparent',
    transition: 'background 0.15s ease',
  },
  threadCardSelected: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
  },
  threadCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  clientName: { fontSize: 14, fontWeight: 700, color: '#f8fafc' },
  sentimentBadge: { padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' },
  threadPreviewText: {
    fontSize: 12,
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: 6,
  },
  threadMetaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  badgeTag: { padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#fff' },

  // Chat Panel
  chatPanel: { flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(7, 12, 22, 0.7)' },
  noChatSelected: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  chatTopBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  smallActionBtn: {
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  messagesArea: { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 },
  msgBubble: {
    maxWidth: '68%',
    padding: '10px 16px',
    borderRadius: 14,
    fontSize: 14,
    position: 'relative',
  },
  msgIncoming: {
    alignSelf: 'flex-start',
    background: 'rgba(30, 41, 59, 0.8)',
    borderBottomLeftRadius: 3,
    color: '#f8fafc',
  },
  msgOutgoing: {
    alignSelf: 'flex-end',
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.35) 100%)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderBottomRightRadius: 3,
    color: '#f8fafc',
  },
  msgTime: { fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 4 },

  draftBox: {
    padding: '14px 20px',
    background: 'rgba(245, 158, 11, 0.1)',
    borderTop: '1px solid rgba(245, 158, 11, 0.3)',
    borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
  },

  replyInputBar: {
    display: 'flex',
    gap: 10,
    padding: '14px 20px',
    background: 'rgba(15, 23, 42, 0.8)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  inputField: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(30, 41, 59, 0.6)',
    color: '#f8fafc',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  sendBtn: {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: '#10b981',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  quickReplyBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(30, 41, 59, 0.8)',
    color: '#f59e0b',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDrawer: {
    padding: '14px 20px',
    background: 'rgba(15, 23, 42, 0.95)',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  quickChip: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(30, 41, 59, 0.5)',
    textAlign: 'left',
    cursor: 'pointer',
  },

  // Catalog Grid
  catalogGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
    gap: 18,
  },
  productCard: {
    padding: 18,
    borderRadius: 14,
    background: 'rgba(30, 41, 59, 0.45)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
  },
  categoryTag: { fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' },
  bestsellerTag: { fontSize: 10, fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: 4 },
  watchName: { fontSize: 16, fontWeight: 700, color: '#f8fafc', marginTop: 4, marginBottom: 6 },
  watchDesc: { fontSize: 12, color: '#94a3b8', lineHeight: 1.4, flex: 1, marginBottom: 12 },
  priceRow: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  watchPrice: { fontSize: 20, fontWeight: 800, color: '#10b981' },
  watchMrp: { fontSize: 13, color: '#64748b', textDecoration: 'line-through' },
  featureList: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  featureChip: { fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: '#cbd5e1' },
  stockActionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' },
  stockToggleBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer' },

  // Settings Grid
  settingsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  settingsCard: {
    padding: 22,
    borderRadius: 14,
    background: 'rgba(30, 41, 59, 0.45)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  cardSectionHeader: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#f8fafc' },
  formRow: { marginBottom: 14 },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 },
  presetOption: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },

  // Stats Grid
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  statCard: {
    padding: 20,
    borderRadius: 14,
    background: 'rgba(30, 41, 59, 0.45)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  statBigNum: { fontSize: 32, fontWeight: 800, color: '#f8fafc', marginBottom: 4 },
  statSub: { fontSize: 12, color: '#94a3b8', fontWeight: 600 },

  // Buttons
  primaryBtn: {
    padding: '10px 22px',
    borderRadius: 10,
    border: 'none',
    background: '#10b981',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '10px 18px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalCard: {
    width: '90%',
    maxWidth: 520,
    padding: 26,
    borderRadius: 18,
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
  },

  // Connect Card
  connectCard: {
    padding: 28,
    borderRadius: 18,
    background: 'rgba(30, 41, 59, 0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  linkedBox: {
    padding: 20,
    borderRadius: 12,
    background: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
};
