'use client';

import { MessageSquare, ShoppingBag, Package, Building2, SlidersHorizontal, BarChart3, Link2, ShieldCheck, ChevronLeft, RefreshCw } from 'lucide-react';
import { mapSearch, mapDirections, mapQuery } from '@/lib/map-links';
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
} from '@/lib/model';
import { initialWAWorkspace, waDefaults, titanWatchesCatalog } from '@/lib/model';

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

async function loadWorkspace(tenantId?: string): Promise<WAWorkspace> {
  const res = await fetch(`/api/whatsapp/workspace?_t=${Date.now()}${tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ''}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
  });
  if (!res.ok) { const error=await res.json().catch(()=>({})); throw Object.assign(new Error(error.error || 'Failed to load workspace'),{status:res.status}); }
  return res.json();
}

const getGoogleMapsSearchUrl=mapSearch;
const getGoogleMapsDirectionsUrl=mapDirections;
const navigationIcons:Record<string,React.ElementType>={inbox:MessageSquare,orders:ShoppingBag,catalog:Package,business:Building2,brain:SlidersHorizontal,analytics:BarChart3,connect:Link2,admin:ShieldCheck};

// ── Main Command Center ─────────────────────────────────────────────────

export default function WhatsAppCommandCenter() {
  const [workspace, setWorkspace] = useState<WAWorkspace>(initialWAWorkspace);
  const [activeTab, setActiveTab] = useState<'inbox' | 'orders' | 'catalog' | 'business' | 'brain' | 'analytics' | 'connect' | 'admin'>('inbox');
  const [selectedThread, setSelectedThread] = useState<WAThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [waStatus, setWaStatus] = useState<any>(null);
  const [activeTenantId,setActiveTenantId]=useState<string>();
  const scopeVersion=useRef(0);
  const [workspaceError,setWorkspaceError]=useState('');

  const refresh = useCallback(async () => {
    try {
      const version=scopeVersion.current;
      const data = await loadWorkspace(activeTenantId);
      if(version!==scopeVersion.current) return;
      setWorkspace(data as any); setWorkspaceError('');
    } catch (e: any) {
      setWorkspaceError(e.message);
      if(e.status===401 || e.status===403) { setWorkspace(initialWAWorkspace); setWaStatus(null); if(e.status===401) setShowAdminLoginModal(true); }
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  const refreshConnect = useCallback(async () => {
    try {
      const version=scopeVersion.current;
      const res = await fetch('/api/whatsapp/connect'+(activeTenantId?'?tenantId='+encodeURIComponent(activeTenantId):''));
      if (res.ok) {const data=await res.json(); if(version===scopeVersion.current) setWaStatus(data);}
    } catch {}
  }, [activeTenantId]);

  useEffect(() => {
    refresh();
    refreshConnect();
    const interval = setInterval(() => {
      refresh();
      refreshConnect();
    }, 4000);

    // Auto-detect admin query intent (e.g. from Instagram Control Room)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === '1' || params.get('admin') === 'true') {
        setShowAdminLoginModal(true);
      }

    }

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
      if(['connect','disconnect','logout'].includes(action)) {
        const response=await fetch('/api/whatsapp/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,tenantId:activeTenantId})});
        if(!response.ok) throw new Error((await response.json()).error);
      } else await api(action, {tenantId:activeTenantId,...body});
      await refresh();
      showToast('Action successful ✓');
    } catch (e: any) {
      showToast('Error: ' + e.message);
    }
  };

  const currentSettings: WASettings = {
    ...waDefaults,
    ...(workspace.settings || {}),
    catalog: workspace.settings?.catalog || [],
  };

  const activeBiz = (workspace.registeredAccounts || []).find((b) => b.id === workspace.activeAccountId) || {
    themeColor: '#10b981',
    name: currentSettings.businessName,
  };
  const themeColor = activeBiz.themeColor || '#10b981';

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
        <div
          style={{
            ...ui.spinner,
            borderTopColor: themeColor,
            boxShadow: `0 0 24px ${themeColor}50`,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: themeColor,
              boxShadow: `0 0 10px ${themeColor}`,
              display: 'inline-block',
            }}
          />
          <p style={{ color: '#596579', margin: 0, fontWeight: 500, letterSpacing: 0.5 }}>
            Initializing {currentSettings.businessName} Concierge Engine...
          </p>
        </div>
      </div>
    );
  }

  const navTabs = [
    { id: 'inbox', label: 'Live Inbox', icon: '' },
    { id: 'orders', label: 'Orders & Live Map', icon: '' },
    { id: 'catalog', label: 'Watches & Catalog', icon: '' },
    { id: 'business', label: 'Store Profile', icon: '' },
    { id: 'brain', label: 'AI Behavior & Tone', icon: '' },
    { id: 'analytics', label: 'Analytics & Leads', icon: '' },
    { id: 'connect', label: 'WhatsApp Device', icon: '' },
    ...(workspace.isNinaAdmin ? [{ id: 'admin', label: 'Nina Master Admin', icon: '' }] : []),
  ];

  return (
    <div className="wa-app" style={ui.root}>
      {/* Toast Notification */}
      {toast && <div style={ui.toast}>{toast}</div>}

      {/* Header Bar */}
      <header className="wa-top-header" style={ui.header}>
        <div style={ui.brandGroup}>
          <div
            style={{
              ...ui.brandIcon,
              borderColor: `${themeColor}60`,
              background: `linear-gradient(135deg, ${themeColor}25 0%, rgba(8,15,30,0.9) 100%)`,
              boxShadow: `0 0 16px ${themeColor}28`,
            }}
          >
            
          </div>
          <div>
            <div style={ui.brandTitleRow}>
              <span style={ui.brandTitle}>{currentSettings.businessName}</span>
              <button
                onClick={() => setShowBusinessModal(true)}
                style={{
                  ...ui.changeBusinessBtn,
                  borderColor: `${themeColor}40`,
                  background: `${themeColor}10`,
                  color: themeColor,
                }}
                title="Customize business profile"
              >
                Switch / Edit Business
              </button>
            </div>
            <span style={ui.brandTagline}>{currentSettings.tagline}</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="wa-top-actions" style={ui.headerRight}>
          {/* Visual Catalog */}
          <a
            href="/catalog"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(217, 119, 6, 0.12)',
              border: '1px solid rgba(217, 119, 6, 0.35)',
              color: '#96610a',
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
             Catalog 
          </a>

          {/* Master Admin Panel link — only visible when authenticated as Nina */}
          {workspace.isNinaAdmin ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: 'rgba(115, 84, 218, 0.16)',
                border: '1px solid rgba(115, 84, 218, 0.4)',
                padding: '5px 11px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 700,
                color: '#6550c8',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ cursor: 'pointer' }} onClick={() => setActiveTab('admin')} title="Open Master Admin Oversight">
                 Nina Master Admin
              </span>
              <button
                onClick={async () => {
                  await fetch('/api/whatsapp/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'logout' }),
                  }).catch(() => {});
                  await refresh();
                  setActiveTab('inbox');
                  showToast('Signed out successfully');
                }}
                style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 10, textDecoration: 'underline', padding: 0 }}
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={async () => {
                if(!workspace.storageReady) {setShowAdminLoginModal(true);return;}
                const response=await fetch('/api/whatsapp/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
                if(response.ok) {scopeVersion.current++;setActiveTenantId(undefined);setWorkspace(initialWAWorkspace);setWaStatus(null);setSelectedThread(null);setShowAdminLoginModal(true);}
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(24,35,52,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {workspace.storageReady ? 'Sign Out' : 'Sign In / Register'}
            </button>
          )}

          {/* WhatsApp Connection Status */}
          <div
            onClick={() => setActiveTab('connect')}
            style={{
              ...ui.connectionPill,
              border: waStatus?.state === 'connected' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.4)',
              background: waStatus?.state === 'connected' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ ...ui.statusDot, background: waStatus?.state === 'connected' ? '#10b981' : '#ef4444', boxShadow: waStatus?.state === 'connected' ? '0 0 6px #10b981' : '0 0 6px #ef4444' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: waStatus?.state === 'connected' ? '#10b981' : '#ef4444' }}>
              {waStatus?.state === 'connected' ? `Linked (${waStatus.connectedPhone || 'Live'})` : 'Disconnected'}
            </span>
          </div>

          {/* KPI Pills */}
          <div className="wa-kpi" style={{ ...ui.kpiPill, cursor: 'pointer' }} onClick={() => setActiveTab('orders')}>
            <span style={{ ...ui.kpiValue, color: '#087f6b' }}>{workspace.orders?.length || 0}</span>
            <span style={ui.kpiLabel}>Orders</span>
          </div>
          <div className="wa-kpi" style={ui.kpiPill} onClick={() => setActiveTab('inbox')} title="Chats">
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
      <nav className="wa-nav-bar" style={ui.nav}>
        {navTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="wa-nav-btn"
              aria-current={isActive ? 'page' : undefined}
              style={{
                ...ui.navBtn,
                ...(isActive
                  ? {
                      background: `${themeColor}1e`,
                      color: themeColor,
                      boxShadow: `inset 0 0 0 1.5px ${themeColor}55, 0 0 12px ${themeColor}18`,
                      fontWeight: 700,
                    }
                  : {
                      color: '#64748b',
                    }),
              }}
            >
              {React.createElement(navigationIcons[tab.id] || MessageSquare,{size:18,"aria-hidden":true})}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Container */}
      <main className="wa-main" style={ui.mainContent}>
        {activeTab === 'inbox' && (
          <InboxView
            threads={filteredThreads}
            selectedThread={selectedThread}
            orders={workspace.orders || []}
            onViewOrders={() => setActiveTab('orders')}
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
          <ConnectView tenantId={activeTenantId} waStatus={waStatus} onAction={doAction} onRefresh={refreshConnect} />
        )}
        {activeTab === 'admin' && workspace.isNinaAdmin && (
          <NinaAdminView
            workspace={workspace}
            onAction={doAction}
            onSwitchBusiness={async (bizId) => {
              scopeVersion.current++; setActiveTenantId(bizId); setSelectedThread(null); setWaStatus(null); setWorkspace(initialWAWorkspace); setLoading(true); setActiveTab('inbox');
            }}
            onOpenOnboard={() => setShowOnboardModal(true)}
          />
        )}
      </main>

      {workspaceError && <div role="alert" style={{padding:16,color:'#f87171'}}>{workspaceError}</div>}
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

      {/* Nina Master Admin Login Modal */}
      {showAdminLoginModal && (
        <AdminLoginModal
          onClose={() => setShowAdminLoginModal(false)}
          onSuccess={async () => {
            setShowAdminLoginModal(false);
            await refresh();
            setActiveTab('inbox');
            showToast('Signed in successfully');
          }}
        />
      )}

      {/* Onboard Client Business Modal */}
      {showOnboardModal && (
        <AdminLoginModal createByAdmin
          onClose={() => setShowOnboardModal(false)}
          onSuccess={async () => {setShowOnboardModal(false); await refresh(); showToast('Business created.');}}
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
  orders = [],
  onViewOrders,
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
  orders?: WAOrder[];
  onViewOrders?: () => void;
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
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(selectedThread ? 'chat' : 'list');
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const lastThreadIdRef = useRef<string>('');
  const lastMsgCountRef = useRef<number>(0);

  useEffect(() => {
    if (selectedThread) {
      setMobileView('chat');
    }
  }, [selectedThread?.id]);

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
    <div className="wa-inbox-layout" style={ui.inboxLayout}>
      {/* Left Chat List */}
      <div className={`wa-inbox-sidebar ${mobileView === 'chat' ? 'wa-hide-on-mobile' : ''}`} style={ui.inboxSidebar}>
        <div style={ui.searchWrapper}>
          <input
            type="text"
            placeholder=" Search inquiries, clients, numbers..."
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
              <div style={{ fontSize: 36, marginBottom: 10 }}></div>
              <div style={{ color: '#334155', fontWeight: 600, fontSize: 14 }}>No conversations yet</div>
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
                onClick={() => {
                  onSelectThread(t);
                  setMobileView('chat');
                }}
                style={{
                  ...ui.threadCard,
                  border: isSelected ? '1px solid rgba(115, 84, 218, 0.4)' : '1px solid transparent',
                  background: isSelected ? 'rgba(115, 84, 218, 0.12)' : undefined,
                }}
              >
                <div style={ui.threadCardTop}>
                  <div style={ui.clientName}>
                    {t.customerProfile?.vip && ' '}
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
                            : '#596579',
                    }}
                  >
                    {t.sentiment || 'neutral'}
                  </span>
                </div>

                <div style={ui.threadPreviewText}>{lastMsg}</div>

                <div style={ui.threadMetaRow}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{t.phone}</span>
                    {t.tags.includes('order_confirmed') && (
                      <span
                        style={{
                          fontSize: 10,
                          background: 'rgba(16, 185, 129, 0.25)',
                          color: '#087f6b',
                          border: '1px solid #10b981',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontWeight: 800,
                        }}
                      >
                        ✓ CONFIRMED
                      </span>
                    )}
                    {t.deliveryLocation && (
                      <span
                        style={{
                          fontSize: 10,
                          background: t.deliveryLocation.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: t.deliveryLocation.verified ? '#087f6b' : '#96610a',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                         {t.deliveryLocation.verified ? 'Mapped' : 'Need PIN'}
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
      <div className={`wa-chat-panel ${mobileView === 'list' ? 'wa-hide-on-mobile' : ''}`} style={ui.chatPanel}>
        {!selectedThread ? (
          <div style={ui.noChatSelected}>
            <div style={{ fontSize: 52, marginBottom: 12 }}></div>
            <h3 style={{ margin: 0, color: '#182334', fontSize: 18 }}>Select a Conversation</h3>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 6, maxWidth: 360, textAlign: 'center' }}>
              Choose any client chat from the sidebar to review live messages, send human replies, or monitor AI responses.
            </p>
          </div>
        ) : (
          <>
            {/* Chat Top Banner */}
            <div style={ui.chatTopBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectThread(null);
                    setMobileView('list');
                  }}
                  className="wa-mobile-back-btn" aria-label="Back to conversations"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#182334',
                    borderRadius: 8,
                    padding: '5px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ← Chats
                </button>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, color: '#182334', fontWeight: 700 }}>
                    {selectedThread.customerProfile?.vip && ' '}
                    {selectedThread.name}
                  </h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{selectedThread.phone}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onAction('takeover', { threadId: selectedThread.id })}
                  style={{
                    ...ui.smallActionBtn,
                    background: selectedThread.takeover ? '#dc2626' : '#2563eb',
                  }}
                >
                  {selectedThread.takeover ? ' Resume AI' : ' Take Over'}
                </button>
                <button
                  onClick={() => onAction('resolve', { threadId: selectedThread.id })}
                  style={{ ...ui.smallActionBtn, background: '#16a34a' }}
                >
                  ✓ Resolved
                </button>
              </div>
            </div>

            {/* Sleek Non-intrusive Order & Location Strip (Leaves 100% space for chat) */}
            {(() => {
              const threadOrder = (orders || []).find((o: WAOrder) => o.threadId === selectedThread.id);
              const loc = selectedThread.deliveryLocation;
              if (!threadOrder && !loc) return null;

              return (
                <div
                  style={{
                    background: 'rgba(10, 18, 36, 0.85)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                    padding: '6px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 11.5,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', flexWrap: 'wrap' }}>
                      {threadOrder && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <span></span>
                          <strong style={{ color: '#38bdf8' }}>{threadOrder.id}</strong>
                          <span style={{ color: '#475569' }}>₹{threadOrder.amount.toLocaleString('en-IN')}</span>
                          <span
                            style={{
                              background: threadOrder.orderStatus === 'ready_for_dispatch' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)',
                              color: threadOrder.orderStatus === 'ready_for_dispatch' ? '#087f6b' : '#2563eb',
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              textTransform: 'uppercase',
                            }}
                          >
                            {threadOrder.orderStatus.replace(/_/g, ' ')}
                          </span>
                        </div>
                      )}

                      {loc && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden' }}>
                          <span style={{ color: '#64748b' }}>•</span>
                          <span style={{ fontSize: 13 }}></span>
                          <span style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {loc.pincode ? `PIN ${loc.pincode}: ` : ''}{loc.raw}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {loc && (
                        <a
                          href={getGoogleMapsSearchUrl(loc)}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            color: '#2563eb',
                            padding: '2px 8px',
                            borderRadius: 5,
                            fontSize: 11,
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                           Map 
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setLocationDrawerOpen((prev) => !prev)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#596579',
                          borderRadius: 5,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {locationDrawerOpen ? '▲ Hide' : '▼ Details'}
                      </button>
                    </div>
                  </div>

                  {locationDrawerOpen && (
                    <div
                      className="accordion-drawer"
                      style={{
                        paddingTop: 8,
                        borderTop: '1px dashed rgba(255,255,255,0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontSize: 11.5,
                        color: '#475569',
                      }}
                    >
                      {threadOrder && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#596579' }}>
                          <span>Product: <b style={{ color: '#182334' }}>{threadOrder.productName}</b></span>
                          <span>Payment: <b style={{ color: '#38bdf8' }}>{threadOrder.paymentMode}</b> ({threadOrder.paymentStatus})</span>
                          {threadOrder.courierPartner && <span>Courier: <b style={{ color: '#a78bfa' }}>{threadOrder.courierPartner}</b> ({threadOrder.trackingNumber || 'Tracking pending'})</span>}
                        </div>
                      )}

                      {loc && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ color: '#182334', fontWeight: 500 }}>{loc.raw}</div>
                            {loc.lat && loc.lng && (
                              <div style={{ color: '#64748b', fontSize: 10.5, marginTop: 2 }}>
                                GPS: {loc.lat.toFixed(4)}° N, {loc.lng.toFixed(4)}° E
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <a
                              href={getGoogleMapsDirectionsUrl(loc)}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: 'var(--nina-surface)',
                                color: '#fff',
                                padding: '3px 8px',
                                borderRadius: 5,
                                fontSize: 11,
                                fontWeight: 600,
                                textDecoration: 'none',
                              }}
                            >
                               Rider Route 
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                const text = `DELIVERY SLIP\nClient: ${selectedThread.name} (${selectedThread.phone})\nAddress: ${loc.raw}\nPIN: ${loc.pincode || 'N/A'}\nMaps: ${loc.mapUrl || ''}`;
                                navigator.clipboard?.writeText(text);
                                alert('Delivery slip copied to clipboard!');
                              }}
                              style={{
                                background: '#334155',
                                color: '#182334',
                                border: '1px solid #475569',
                                borderRadius: 5,
                                padding: '3px 8px',
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                               Copy Slip
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

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
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}> AI CONSULTATIVE DRAFT</span>
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
                <div style={{ color: '#182334', fontSize: 13, lineHeight: 1.4 }}>{selectedThread.draft}</div>
              </div>
            )}

            {/* Bottom Reply Bar */}
            <div style={ui.replyInputBar}>
              <button
                onClick={() => setShowQuick(!showQuick)}
                style={ui.quickReplyBtn}
                title="Quick Product & Policy Replies"
              >
                
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
                   QUICK RESPONSES & WATCH SPECS
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
                      <div style={{ fontWeight: 600, color: '#182334', fontSize: 12 }}>{qr.label}</div>
                      <div style={{ color: '#596579', fontSize: 11, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
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
          <h2 style={{ margin: 0, fontSize: 22, color: '#182334', fontWeight: 800 }}> Product & Watch Catalog</h2>
          <p style={{ color: '#596579', fontSize: 13, marginTop: 4 }}>
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
              {watch.bestseller && <span style={ui.bestsellerTag}> BESTSELLER</span>}
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
            <h3 style={{ margin: '0 0 16px', color: '#182334', fontSize: 18 }}>+ Add Watch / Product to Catalog</h3>
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

              <div data-layout="columns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <h2 style={{ margin: 0, fontSize: 22, color: '#182334', fontWeight: 800 }}> Store Profile & Policies</h2>
          <p style={{ color: '#596579', fontSize: 13, marginTop: 4 }}>
            Configure your brand identity, store hours, warranty, shipping, and active discount vouchers.
          </p>
        </div>
        <button onClick={() => onSave(form)} style={ui.primaryBtn}>
           Save Changes
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
          <h2 style={{ margin: 0, fontSize: 22, color: '#182334', fontWeight: 800 }}> AI Thinking & Human Texting Engine</h2>
          <p style={{ color: '#596579', fontSize: 13, marginTop: 4 }}>
            Tailor the consultative intelligence, response length, typing simulations, and tone mirroring.
          </p>
        </div>
        <button onClick={() => onSave(form)} style={ui.primaryBtn}>
           Save Settings
        </button>
      </div>

      <div style={ui.settingsGrid}>
        {/* Language & Casual Hinglish Mode */}
        <div style={{ ...ui.settingsCard, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h4 style={ui.cardSectionHeader}> AI Conversational Language & Mode</h4>
            <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#087f6b', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
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
                icon: '',
                title: 'Hinglish (Casual & Chic)',
                badge: 'Recommended',
                desc: 'Always converses casually in natural, stylish Hinglish ("Haanji bilkul", "Main check karti hu ") even if customer texted in English.',
              },
              {
                id: 'English',
                icon: '',
                title: 'English (Polished Luxury)',
                desc: 'Speaks 100% in refined, professional luxury English for all international and corporate clients.',
              },
              {
                id: 'Hindi',
                icon: '',
                title: 'Hindi (हिंदी)',
                desc: 'Converses respectfully in polite, graceful conversational Hindi.',
              },
              {
                id: 'auto',
                icon: '',
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
                    border: isSelected ? '1px solid #10b981' : '1px solid rgba(24,35,52,0.08)',
                    background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: isSelected ? '#10b981' : '#182334', fontSize: 13 }}>
                      {lang.icon} {lang.title}
                    </div>
                    {lang.badge && (
                      <span style={{ fontSize: 9, background: '#10b981', color: '#0f172a', fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>
                        {lang.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#596579', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{lang.desc}</div>
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
                  border: form.length === p.id ? '1px solid #10b981' : '1px solid rgba(24,35,52,0.08)',
                  background: form.length === p.id ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                }}
              >
                <div style={{ fontWeight: 600, color: form.length === p.id ? '#10b981' : '#182334', fontSize: 13 }}>
                  {p.title}
                </div>
                <div style={{ color: '#596579', fontSize: 11, marginTop: 2 }}>{p.desc}</div>
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
                <div style={{ color: '#182334', fontSize: 14, fontWeight: 600 }}>WhatsApp "Typing..." Indicator</div>
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
                <div style={{ color: '#182334', fontSize: 14, fontWeight: 600 }}>Read Receipts (Blue Ticks)</div>
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
                <div style={{ color: '#182334', fontSize: 14, fontWeight: 600 }}>Require Manual Approval Before Sending</div>
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
      <h2 style={{ margin: '0 0 20px', fontSize: 22, color: '#182334', fontWeight: 800 }}> Live Performance & Leads</h2>

      <div style={ui.statsGrid}>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
          <div style={ui.statBigNum}>{threads.length}</div>
          <div style={ui.statSub}>Total Client Inquiries</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
          <div style={{ ...ui.statBigNum, color: '#f59e0b' }}>
            {threads.filter((t) => t.tags.includes('hot_lead') || t.tags.includes('order_inquiry')).length}
          </div>
          <div style={ui.statSub}>High Intent / Ready to Buy</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
          <div style={{ ...ui.statBigNum, color: '#10b981' }}>
            {threads.filter((t) => t.customerProfile?.vip || t.tags.includes('luxury_buyer')).length}
          </div>
          <div style={ui.statSub}>Luxury / VIP Clients</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
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
  tenantId,
  waStatus,
  onAction,
  onRefresh,
}: {
  tenantId?: string;
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
        body: JSON.stringify({ action: 'connect', tenantId }),
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 680, margin: '0 auto' }}>
      {/* Status Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 24,
          padding: '16px 22px',
          borderRadius: 14,
          background: isConnected
            ? 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(5,150,105,0.08) 100%)'
            : 'rgba(10, 18, 38, 0.7)',
          border: isConnected
            ? '1px solid rgba(16,185,129,0.3)'
            : '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            background: isConnected
              ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
              : 'rgba(24,35,52,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            flexShrink: 0,
            boxShadow: isConnected ? '0 4px 16px rgba(16,185,129,0.3)' : 'none',
          }}
        >
          
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#182334' }}>WhatsApp Linked Device</span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 20,
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                background: isConnected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.18)',
                color: isConnected ? '#087f6b' : '#f87171',
                border: isConnected ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.35)',
              }}
            >
              {isConnected ? ' LIVE' : hasQR ? ' AWAITING SCAN' : ' OFFLINE'}
            </span>
          </div>
          <span style={{ fontSize: 13, color: isConnected ? '#10b981' : '#64748b' }}>
            {isConnected
              ? `✓ Authenticated as +${waStatus.connectedPhone} — AI concierge is active`
              : 'Link your WhatsApp number to start receiving and responding to customer messages'}
          </span>
        </div>
        <button
          onClick={onRefresh}
          style={{
            background: 'rgba(24,35,52,0.08)',
            border: '1px solid rgba(24,35,52,0.12)',
            color: '#596579',
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="Refresh connection status"
        ><RefreshCw size={18} aria-hidden="true" /></button>
      </div>

      {/* Main Content Card */}
      <div style={ui.connectCard}>
        {isConnected ? (
          <div className="fade-in-entry">
            <div style={ui.linkedBox}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginBottom: 10 }}>
                 Live & Listening to Customer Chats
              </div>
              <p style={{ color: '#596579', fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
                Device authenticated as <strong style={{ color: '#182334' }}>+{waStatus.connectedPhone}</strong>. Incoming customer
                WhatsApp messages will trigger the AI concierge automatically. You can monitor live conversations in the{' '}
                <strong style={{ color: '#10b981' }}>Live Inbox</strong> tab.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 10,
                  marginBottom: 18,
                }}
              >
                {[
                  { label: 'AI Responses', value: 'Active', color: '#10b981', icon: '' },
                  { label: 'Auto-Read Receipts', value: 'Enabled', color: '#2563eb', icon: '✓✓' },
                  { label: 'Typing Simulation', value: '3s delay', color: '#f59e0b', icon: '' },
                  { label: 'Concierge Mode', value: 'Luxury', color: '#6550c8', icon: '' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{stat.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
              <button
                onClick={() => onAction('disconnect')}
                style={{
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171',
                  padding: '9px 18px',
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Disconnect Device
              </button>
            </div>
          </div>
        ) : hasQR ? (
          <div className="fade-in-entry" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px' }}>
            <div style={{ marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#182334', marginBottom: 4 }}>Scan QR with WhatsApp</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>QR code refreshes every 20 seconds</div>
            </div>

            <div
              className="qr-shine-border"
              style={{
                position: 'relative',
                background: '#ffffff',
                padding: 16,
                borderRadius: 18,
                marginBottom: 22,
                boxShadow: '0 0 0 1px rgba(16,185,129,0.3), 0 20px 50px rgba(0,0,0,0.5)',
              }}
            >
              <img src={waStatus.qrDataUrl} alt="WhatsApp QR Code" style={{ width: 240, height: 240, display: 'block' }} />
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981', marginBottom: 10 }}>
               Scan with WhatsApp on your Phone
            </div>

            <div
              style={{
                background: 'var(--nina-surface)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12,
                padding: '14px 18px',
                maxWidth: 420,
                width: '100%',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#596579', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                How to Link:
              </div>
              {[
                'Open WhatsApp on your phone',
                'Tap ⋮ Menu → Linked Devices',
                'Tap "Link a Device"',
                'Point your camera at the QR code above',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 7 }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'rgba(16,185,129,0.2)',
                      border: '1px solid rgba(16,185,129,0.4)',
                      color: '#10b981',
                      fontSize: 10,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="fade-in-entry" style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(59,130,246,0.12) 100%)',
                border: '1px solid rgba(16,185,129,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 34,
                margin: '0 auto 20px',
              }}
            >
              
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: '#182334' }}>
              Link Your WhatsApp Business
            </h3>
            <p style={{ color: '#64748b', fontSize: 13, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
              Connect your WhatsApp number without Meta Developer approval. Just scan once — works exactly like WhatsApp Web.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
                marginBottom: 28,
                maxWidth: 540,
                margin: '0 auto 28px',
              }}
            >
              {[
                { icon: '', title: 'Instant Setup', desc: 'Go live in under 60 seconds' },
                { icon: '', title: 'Secure & Private', desc: 'No API keys or Meta approval' },
                { icon: '', title: 'AI Auto-Reply', desc: 'Luxury concierge on 24/7' },
                { icon: '', title: 'Live Dashboard', desc: 'Orders, chats & analytics' },
              ].map((f) => (
                <div
                  key={f.title}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(24,35,52,0.08)',
                    borderRadius: 10,
                    padding: '14px 12px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#182334', marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 10.5, color: '#64748b' }}>{f.desc}</div>
                </div>
              ))}
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                background: connecting
                  ? 'rgba(24,35,52,0.08)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: connecting ? '#64748b' : '#fff',
                padding: '13px 32px',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: connecting ? 'not-allowed' : 'pointer',
                boxShadow: connecting ? 'none' : '0 6px 20px rgba(16,185,129,0.35)',
                transition: 'all 0.18s ease',
              }}
            >
              {connecting ? (
                <>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.2)',
                      borderTopColor: '#fff',
                      animation: 'spin 0.8s linear infinite',
                      display: 'inline-block',
                    }}
                  />
                  Generating QR Code...
                </>
              ) : (
                <> Link WhatsApp Device</>
              )}
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
          <h3 style={{ margin: 0, color: '#182334', fontSize: 18 }}> Configure Business Identity</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#596579', fontSize: 20, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <p style={{ color: '#596579', fontSize: 13, marginBottom: 16 }}>
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
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newProduct, setNewProduct] = useState(catalog[0]?.name || 'Titan Edge Ceramic Midnight Black');
  const [newAmount, setNewAmount] = useState(catalog[0]?.price || 29995);
  const [newAddress, setNewAddress] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPayment, setNewPayment] = useState<'COD' | 'UPI'>('COD');

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  // Active coordinates for map display
  const mapLat = selectedOrder?.deliveryLocation?.lat;
  const mapLng = selectedOrder?.deliveryLocation?.lng;

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
            <h2 style={{ margin: 0, fontSize: 22, color: '#182334', fontWeight: 800 }}>
               Confirmed Orders & Live Delivery Radar
            </h2>
            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#087f6b', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>
              GPS Geocoded & Mapped
            </span>
          </div>
          <p style={{ color: '#596579', fontSize: 13, marginTop: 4 }}>
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
          <div style={{ fontSize: 11, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>Total Orders</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#182334', marginTop: 4 }}>{orders.length}</div>
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>₹{totalRevenue.toLocaleString('en-IN')} Total Value</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 11, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>Ready for Dispatch</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#087f6b', marginTop: 4 }}>{readyCount}</div>
          <div style={{ fontSize: 12, color: '#596579', marginTop: 2 }}>Delivery details</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 11, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>In Transit / Dispatched</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>{dispatchedCount}</div>
          <div style={{ fontSize: 12, color: '#596579', marginTop: 2 }}>With Courier Partner</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 11, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>Missing PIN Code</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: missingPinCount > 0 ? '#f59e0b' : '#64748b', marginTop: 4 }}>
            {missingPinCount}
          </div>
          <div style={{ fontSize: 12, color: missingPinCount > 0 ? '#96610a' : '#64748b', marginTop: 2 }}>
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
          background: 'var(--nina-surface)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 24,
        }}
      >
        {/* Left: Embedded Google Map */}
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', minHeight: 280, border: '1px solid rgba(24,35,52,0.12)' }}>
          <iframe
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 0, width: '100%', height: '100%', minHeight: 280 }}
            src={`https://www.google.com/maps?q=${encodeURIComponent(
              mapQuery(selectedOrder?.deliveryLocation)
            )}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
            allowFullScreen
            loading="lazy"
          />
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: 'var(--nina-surface)',
              backdropFilter: 'blur(8px)',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              color: '#087f6b',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
             Live GPS Radar · {selectedOrder ? selectedOrder.id : 'Mysore Central'}
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
                    <h3 style={{ margin: '4px 0 0', fontSize: 18, color: '#182334', fontWeight: 800 }}>
                      {selectedOrder.customerName}
                    </h3>
                    <div style={{ color: '#596579', fontSize: 12 }}>{selectedOrder.customerPhone}</div>
                  </div>

                  <span
                    style={{
                      background: selectedOrder.deliveryLocation?.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: selectedOrder.deliveryLocation?.verified ? '#087f6b' : '#96610a',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 6,
                    }}
                  >
                    {selectedOrder.deliveryLocation?.verified ? ' ADDRESS CONFIRMED' : ' NEEDS REVIEW'}
                  </span>
                </div>

                {/* Product & Payment */}
                <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 8, padding: 12, margin: '14px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#182334', fontSize: 14 }}>{selectedOrder.productName}</span>
                    <span style={{ fontWeight: 800, color: '#087f6b', fontSize: 16 }}>
                      ₹{selectedOrder.amount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* If bulk order with itemized list */}
                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#596579', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                         Itemized Timepieces ({selectedOrder.quantity || selectedOrder.items.length} units):
                      </div>
                      {selectedOrder.items.map((it, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', padding: '2px 0' }}>
                          <span>• {it.productName} × {it.quantity}</span>
                          <span style={{ color: '#087f6b', fontWeight: 600 }}>₹{it.totalPrice.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {selectedOrder.subtotal && selectedOrder.discountAmount ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#96610a', marginTop: 4, borderTop: '1px dashed rgba(24,35,52,0.12)', paddingTop: 4 }}>
                          <span>Subtotal: ₹{selectedOrder.subtotal.toLocaleString('en-IN')}</span>
                          <span>VIP {selectedOrder.discountCode || 'TITAN10'}: −₹{selectedOrder.discountAmount.toLocaleString('en-IN')}</span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: '#596579', flexWrap: 'wrap' }}>
                    <span>Payment: <b style={{ color: '#182334' }}>{selectedOrder.paymentMode}</b> ({selectedOrder.paymentStatus})</span>
                    {selectedOrder.discountCode && <span>Promo: <b style={{ color: '#96610a' }}>{selectedOrder.discountCode}</b></span>}
                    {selectedOrder.courierPartner && <span>Courier: <b style={{ color: '#2563eb' }}>{selectedOrder.courierPartner}</b></span>}
                  </div>
                </div>

                {/* Delivery Address & GPS Coordinates */}
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                    Delivery Address & GPS Coordinates
                  </div>
                  <div style={{ color: '#182334', fontWeight: 500 }}>
                    {selectedOrder.deliveryLocation?.raw || 'Address pending'}
                  </div>
                  {selectedOrder.deliveryLocation?.pincode && (
                    <div style={{ color: '#087f6b', fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                       Postal PIN Code: {selectedOrder.deliveryLocation.pincode}
                    </div>
                  )}
                  {selectedOrder.deliveryLocation?.lat && (
                    <div style={{ color: '#596579', fontSize: 11, marginTop: 2 }}>
                       GPS: {selectedOrder.deliveryLocation.lat.toFixed(4)}° N, {selectedOrder.deliveryLocation.lng?.toFixed(4)}° E
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
                     Google Maps
                  </a>
                )}
                {selectedOrder.deliveryLocation && (
                  <a
                    href={getGoogleMapsDirectionsUrl(selectedOrder.deliveryLocation)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: 'var(--nina-surface)',
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
                     Rider Route
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
                    color: '#182334',
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: '1px solid #475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                   Copy Slip
                </button>
                <button
                  onClick={() => onJumpToChat(selectedOrder.threadId)}
                  style={{
                    background: 'var(--nina-surface)',
                    color: '#182334',
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                   Open Chat
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}></div>
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
            { id: 'needs_pin', label: ' Needs PIN' },
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
          <div style={{ fontSize: 40, marginBottom: 10 }}></div>
          <h4 style={{ margin: 0, color: '#182334' }}>No orders found</h4>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            Create an order with the customer's actual delivery address. Confirm the map position before dispatch.
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
                      <span style={{ fontWeight: 800, color: '#087f6b', fontSize: 14 }}>{ord.id}</span>
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

                    <div style={{ fontWeight: 700, color: '#182334', fontSize: 15, marginTop: 4 }}>
                      {ord.customerName} · <span style={{ color: '#596579', fontWeight: 500 }}>{ord.customerPhone}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#087f6b', fontSize: 16 }}>₹{ord.amount.toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: 11, color: '#596579' }}>{ord.paymentMode} ({ord.paymentStatus})</div>
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
                        color: '#182334',
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
                  <div style={{ fontSize: 13, color: '#334155' }}>
                     <b style={{ color: '#182334' }}>{ord.productName}</b>
                    {ord.quantity && ord.quantity > 1 && (
                      <span style={{ marginLeft: 8, background: '#d97706', color: '#000', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
                        {ord.quantity} WATCHES
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#596579' }}>
                     <span>{ord.deliveryLocation?.raw}</span>
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
                        style={{ ...ui.smallActionBtn, background: 'var(--nina-surface)', border: '1px solid #334155', color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      >
                         Map
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToChat(ord.threadId);
                      }}
                      style={{ ...ui.smallActionBtn, background: 'var(--nina-surface)', border: '1px solid #334155', color: '#087f6b' }}
                    >
                       Chat
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
                  placeholder="House number, street, locality, city"
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
                    const orderId = `ORD-${crypto.randomUUID()}`;
                    const lat = undefined;
                    const lng = undefined;
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
                      orderStatus: 'confirmed',
                      deliveryLocation: {
                        raw: fullAddr,
                        pincode: newPin || undefined,
                        pincodeMissing: !newPin,
                        hasAddressDetails: true,
                        city: undefined,
                        state: undefined,
                        lat,
                        lng,
                        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`,
                        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`,
                        formattedAddress: fullAddr,
                        verified: false,
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
// ── NINA MASTER ADMIN CONSOLE & CLIENT ACCOUNTS ────────────────────────
// ════════════════════════════════════════════════════════════════════════

function NinaAdminView({
  workspace,
  onAction,
  onSwitchBusiness,
  onOpenOnboard,
}: {
  workspace: WAWorkspace;
  onAction: (action: string, body?: any) => Promise<void>;
  onSwitchBusiness: (bizId: string) => Promise<void>;
  onOpenOnboard: () => void;
}) {
  const [adminSearch, setAdminSearch] = useState('');
  const [refreshingDb, setRefreshingDb] = useState(false);

  const turso = workspace.tursoStats || {
    connected: true,
    provider: 'Turso LibSQL (Cloud Distributed)',
    totalRows: 0,
    tableCounts: { threads: 0, orders: 0, customers: 0, jobs: 0, activity: 0, state: 0 },
    storageEstimateKb: 0,
    storageEstimateMb: '0.00',
    health: 'Operational (Turso LibSQL Cloud)',
    lastChecked: Date.now(),
  };

  const registeredAccounts = workspace.registeredAccounts || [];
  const filteredAccounts = registeredAccounts.filter(
    (a) =>
      a.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
      a.phone.includes(adminSearch) ||
      a.category.toLowerCase().includes(adminSearch.toLowerCase()) ||
      a.ownerName.toLowerCase().includes(adminSearch.toLowerCase())
  );

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Admin Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(115, 84, 218, 0.16) 0%, rgba(16, 185, 129, 0.1) 100%)',
          border: '1px solid rgba(115, 84, 218, 0.35)',
          borderRadius: 16,
          padding: '24px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #7354da 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              boxShadow: '0 4px 16px rgba(115, 84, 218, 0.4)',
            }}
          >
            
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: '#182334', fontWeight: 800 }}>
                Nina Kurain · Master WhatsApp Administration
              </h2>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#087f6b',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                MULTI-CLIENT HQ
              </span>
            </div>
            <p style={{ margin: '4px 0 0', color: '#596579', fontSize: 13 }}>
              Onboard businesses, manage client instances, inspect WhatsApp activities & monitor Turso database utilization.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={onOpenOnboard}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            }}
          >
            <span> Onboard Client Business</span>
          </button>
        </div>
      </div>

      {/* 4 Master KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div style={{ background: 'var(--nina-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#596579', fontSize: 13, marginBottom: 8 }}>
            <span>Client Businesses</span>
            <span style={{ fontSize: 18 }}></span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#182334' }}>
            {registeredAccounts.length}
          </div>
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 4, fontWeight: 600 }}>
            Active & ready for clients
          </div>
        </div>

        <div style={{ background: 'var(--nina-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#596579', fontSize: 13, marginBottom: 8 }}>
            <span>WhatsApp Devices</span>
            <span style={{ fontSize: 18 }}></span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#182334' }}>
            {registeredAccounts.filter((a) => a.deviceStatus === 'connected').length || (workspace.connections?.whatsappVerified ? 1 : 0)}
          </div>
          <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4, fontWeight: 600 }}>
            Live paired instances
          </div>
        </div>

        <div style={{ background: 'var(--nina-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#596579', fontSize: 13, marginBottom: 8 }}>
            <span>Total System Chats</span>
            <span style={{ fontSize: 18 }}></span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#182334' }}>
            {workspace.threads?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 4, fontWeight: 600 }}>
            Across all client businesses
          </div>
        </div>

        <div style={{ background: 'var(--nina-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#596579', fontSize: 13, marginBottom: 8 }}>
            <span>Total System Orders</span>
            <span style={{ fontSize: 18 }}></span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#182334' }}>
            {workspace.orders?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: '#087f6b', marginTop: 4, fontWeight: 600 }}>
            Verified customer bookings
          </div>
        </div>
      </div>

      {/* Turso DB Usage Tracker Card */}
      <div
        style={{
          background: 'var(--nina-surface)',
          border: '1px solid rgba(115, 84, 218, 0.3)',
          borderRadius: 16,
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}></span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: '#182334', fontWeight: 700 }}>
                  Turso Cloud Database Usage & Health Monitor
                </h3>
                <span
                  style={{
                    background: turso.connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: turso.connected ? '#087f6b' : '#f87171',
                    border: `1px solid ${turso.connected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {turso.connected ? ' TURSO CLOUD ACTIVE' : ' DEGRADED'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', color: '#596579', fontSize: 12 }}>
                High-performance distributed SQLite (LibSQL) shared seamlessly between Instagram & WhatsApp instances.
              </p>
            </div>
          </div>

          <button
            onClick={async () => {
              setRefreshingDb(true);
              try {
                await onAction('refresh-turso-stats');
              } finally {
                setRefreshingDb(false);
              }
            }}
            disabled={refreshingDb}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#182334',
              padding: '7px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{refreshingDb ? ' Refreshing...' : ' Refresh DB Metrics'}</span>
          </button>
        </div>

        {/* Storage Bar */}
        <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: '#475569' }}>
              Turso Storage Footprint: <strong style={{ color: '#38bdf8' }}>{turso.storageEstimateKb} KB</strong> (~{turso.storageEstimateMb} MB)
            </span>
            <span style={{ color: '#596579', fontSize: 12 }}>
              Total Rows Recorded: <strong style={{ color: '#182334' }}>{turso.totalRows}</strong> / Free Tier Quota ~9 GB
            </span>
          </div>
          <div style={{ width: '100%', height: 8, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(2, Math.min(100, (turso.storageEstimateKb / 10240) * 100))}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10b981 0%, #7354da 100%)',
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#64748b' }}>
            <span>Healthy Storage Utilization (&lt; 0.1%)</span>
            <span>Zero latency cloud replicas</span>
          </div>
        </div>

        {/* Table Breakdown Chips */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Live Turso Tables Breakdown:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#596579' }}>wa_threads</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8', marginTop: 2 }}>{turso.tableCounts?.threads || 0}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Conversations & messages</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#596579' }}>wa_orders</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#087f6b', marginTop: 2 }}>{turso.tableCounts?.orders || 0}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Confirmed bookings & pins</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#596579' }}>wa_customers</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#96610a', marginTop: 2 }}>{turso.tableCounts?.customers || 0}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Profiles & phone numbers</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#596579' }}>wa_jobs</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#a78bfa', marginTop: 2 }}>{turso.tableCounts?.jobs || 0}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Async queue jobs</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#596579' }}>wa_activity</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f472b6', marginTop: 2 }}>{turso.tableCounts?.activity || 0}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Audit log entries</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#596579' }}>wa_state</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#c084fc', marginTop: 2 }}>{turso.tableCounts?.state || 0}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Tenant stores & configs</div>
            </div>
          </div>
        </div>
      </div>

      {/* Registered Businesses Table */}
      <div
        style={{
          background: 'var(--nina-surface)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: '#182334', fontWeight: 700 }}>
              Registered Client Businesses ({registeredAccounts.length})
            </h3>
            <p style={{ margin: '2px 0 0', color: '#596579', fontSize: 12 }}>
              Client organizations using Nina WhatsApp Automation. Switch workspaces anytime to configure their bot or test.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder=" Filter client businesses..."
              value={adminSearch}
              onChange={(e) => setAdminSearch(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#182334',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                outline: 'none',
                minWidth: 220,
              }}
            />
          </div>
        </div>

        {/* Table of Accounts */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#596579', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px' }}>Business</th>
                <th style={{ padding: '10px 14px' }}>Owner & Phone</th>
                <th style={{ padding: '10px 14px' }}>Category</th>
                <th style={{ padding: '10px 14px' }}>Device</th>
                <th style={{ padding: '10px 14px' }}>Activity</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acc) => {
                const isActive = (workspace.activeAccountId || 'biz_titan_watches') === acc.id;
                return (
                  <tr
                    key={acc.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: isActive ? 'rgba(115, 84, 218, 0.07)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: acc.themeColor || '#10b981',
                            boxShadow: `0 0 8px ${acc.themeColor || '#10b981'}`,
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, color: '#182334', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{acc.name}</span>
                            {isActive && (
                              <span style={{ fontSize: 9, background: '#7354da', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#596579', marginTop: 2 }}>{acc.tagline}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px' }}>
                      <div style={{ color: '#475569' }}>{acc.ownerName}</div>
                      <div style={{ fontSize: 11, color: '#596579' }}>{acc.phone}</div>
                    </td>

                    <td style={{ padding: '14px' }}>
                      <span
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#475569',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {acc.category}
                      </span>
                    </td>

                    <td style={{ padding: '14px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: acc.deviceStatus === 'connected' ? '#087f6b' : '#596579',
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: acc.deviceStatus === 'connected' ? '#10b981' : '#64748b',
                          }}
                        />
                        {acc.deviceStatus === 'connected' ? 'Linked' : 'Standby'}
                      </span>
                    </td>

                    <td style={{ padding: '14px' }}>
                      <div style={{ color: '#475569', fontSize: 12 }}>
                        {acc.threadCount || 0} chats · {acc.orderCount || 0} orders
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            background: acc.status === 'suspended' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: acc.status === 'suspended' ? '#f87171' : '#087f6b',
                            border: `1px solid ${acc.status === 'suspended' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                          }}
                        >
                          {acc.status === 'suspended' ? ' SUSPENDED' : '● ACTIVE'}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={() => onSwitchBusiness(acc.id)}
                          style={{
                            background: isActive ? 'rgba(115, 84, 218, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                            color: isActive ? '#6550c8' : '#182334',
                            border: `1px solid ${isActive ? '#7354da' : 'rgba(255,255,255,0.12)'}`,
                            padding: '5px 12px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {isActive ? '✓ In Workspace' : 'Inspect ➔'}
                        </button>

                        {acc.id !== 'biz_titan_watches' && (
                          <button
                            onClick={async () => {
                              const action = acc.status === 'suspended' ? 'reactivate-business' : 'suspend-business';
                              await onAction(action, { businessId: acc.id });
                            }}
                            style={{
                              background: acc.status === 'suspended' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: acc.status === 'suspended' ? '#087f6b' : '#f87171',
                              border: `1px solid ${acc.status === 'suspended' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title={acc.status === 'suspended' ? 'Reactivate tenant' : 'Suspend tenant'}
                          >
                            {acc.status === 'suspended' ? '✓ Reactivate' : ' Suspend'}
                          </button>
                        )}

                        {registeredAccounts.length > 1 && acc.id !== 'biz_titan_watches' && (
                          <button
                            onClick={() => {
                              if (confirm(`Remove client business "${acc.name}" from WhatsApp automation?`)) {
                                onAction('delete-business', { businessId: acc.id });
                              }
                            }}
                            style={{
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              padding: '5px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                            title="Remove Client"
                          >
                            
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Multi-Tenant Authentication & Free Onboarding Modal ─────────────────
function AdminLoginModal({
  createByAdmin = false,
  onClose,
  onSuccess,
}: {
  createByAdmin?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<'signin' | 'register'>(createByAdmin ? 'register' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('Luxury Watches & Boutique');
  const [tagline, setTagline] = useState('Timeless Craftsmanship, Modern Innovation');
  const [themeColor, setThemeColor] = useState('#10b981');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign in failed');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: createByAdmin ? 'create-business' : 'register',
          businessName,
          ownerName,
          email,
          password,
          phone,
          category,
          tagline,
          themeColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={ui.modalOverlay}>
      <div style={{ ...ui.modalCard, maxWidth: tab === 'register' ? 520 : 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}></span>
            <h3 style={{ margin: 0, color: '#182334', fontSize: 17, fontWeight: 700 }}>
              {tab === 'signin' ? 'Sign In to Workspace' : 'Register New Business (Free)'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#596579', fontSize: 20, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 8 }}>
          <button
            type="button"
            onClick={() => { setTab('signin'); setError(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: tab === 'signin' ? 'rgba(115, 84, 218, 0.4)' : 'transparent',
              color: tab === 'signin' ? '#ffffff' : '#596579',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: tab === 'register' ? 'rgba(16, 185, 129, 0.3)' : 'transparent',
              color: tab === 'register' ? '#ffffff' : '#596579',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Register Business (Free)
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#fca5a5', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Email Address
              </label>
              <input
                type="email"
                autoFocus
                placeholder="name@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={ui.inputField}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Password
              </label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={ui.inputField}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={onClose} style={ui.cancelBtn}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !email || !password}
                style={{
                  ...ui.saveBtn,
                  background: 'linear-gradient(135deg, #7354da 0%, #5833b8 100%)',
                }}
              >
                {busy ? 'Authenticating...' : 'Sign In ➔'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Business Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Aura Boutique"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  style={ui.inputField}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Owner Name
                </label>
                <input
                  type="text"
                  placeholder="Your Full Name"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  required
                  style={ui.inputField}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Email (Login)
                </label>
                <input
                  type="email"
                  placeholder="owner@boutique.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={ui.inputField}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Password (min 8 chars)
                </label>
                <input
                  type="password"
                  placeholder="Create password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  style={ui.inputField}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  WhatsApp Phone
                </label>
                <input
                  type="text"
                  placeholder="+91 99000 00000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={ui.inputField}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Category
                </label>
                <input
                  type="text"
                  placeholder="Retail, Clinic, Fashion..."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={ui.inputField}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                Tagline / Brand Bio
              </label>
              <input
                type="text"
                placeholder="Excellence in customer care"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                style={ui.inputField}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                Brand Accent Color
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {['#10b981', '#7354da', '#f59e0b', '#3b82f6', '#ec4899', '#06b6d4'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setThemeColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: c,
                      border: themeColor === c ? '2px solid #ffffff' : '2px solid transparent',
                      cursor: 'pointer',
                      boxShadow: themeColor === c ? `0 0 10px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={onClose} style={ui.cancelBtn}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !businessName || !email || password.length < 12}
                style={{
                  ...ui.saveBtn,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                }}
              >
                {busy ? 'Creating Workspace...' : 'Register Workspace (Free) '}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Onboard Client Business Modal ──────────────────────────────────────
function OnboardBusinessModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (biz: {
    name: string;
    ownerName: string;
    phone: string;
    category: string;
    tagline: string;
    themeColor: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('Luxury Watches & Boutique');
  const [tagline, setTagline] = useState('Timeless Craftsmanship, Modern Innovation');
  const [themeColor, setThemeColor] = useState('#10b981');
  const [busy, setBusy] = useState(false);

  const colors = [
    { label: 'Emerald', hex: '#10b981' },
    { label: 'Purple / Violet', hex: '#7354da' },
    { label: 'Gold / Amber', hex: '#f59e0b' },
    { label: 'Blue', hex: '#3b82f6' },
    { label: 'Rose / Pink', hex: '#ec4899' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ name, ownerName, phone, category, tagline, themeColor });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={ui.modalOverlay}>
      <div style={{ ...ui.modalCard, maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}></span>
            <h3 style={{ margin: 0, color: '#182334', fontSize: 18, fontWeight: 700 }}>
              Onboard Client Business (Free)
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#596579', fontSize: 20, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <p style={{ color: '#596579', fontSize: 13, marginBottom: 18 }}>
          Create an automated WhatsApp instance for your new client. No payment gateway required.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
              Business Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Zara Boutique, Dr. Care Clinic"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={ui.inputField}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                Client Owner Name
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Patel"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                style={ui.inputField}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                WhatsApp Phone Number
              </label>
              <input
                type="text"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={ui.inputField}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={ui.inputField}
            >
              <option value="Luxury Watches & Boutique">Luxury Watches & Boutique</option>
              <option value="Fashion & Apparel">Fashion & Apparel</option>
              <option value="Jewelry & Accessories">Jewelry & Accessories</option>
              <option value="Clinic & Healthcare">Clinic & Healthcare</option>
              <option value="Real Estate & Property">Real Estate & Property</option>
              <option value="Restaurant & Bakery">Restaurant & Bakery</option>
              <option value="Professional Consulting">Professional Consulting</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
              Tagline / Mission
            </label>
            <input
              type="text"
              placeholder="e.g. Crafted with passion, delivered with speed"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              style={ui.inputField}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Brand Theme Color
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              {colors.map((c) => (
                <div
                  key={c.hex}
                  onClick={() => setThemeColor(c.hex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1.5px solid ${themeColor === c.hex ? c.hex : 'rgba(24,35,52,0.12)'}`,
                    background: themeColor === c.hex ? `${c.hex}22` : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.hex }} />
                  <span style={{ color: themeColor === c.hex ? '#182334' : '#596579' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button type="button" onClick={onClose} style={ui.cancelBtn}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              style={{
                ...ui.saveBtn,
                background: `linear-gradient(135deg, ${themeColor} 0%, #059669 100%)`,
              }}
            >
              {busy ? 'Registering...' : 'Create Business Instance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ── MODERN LUXURY UI STYLES ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const ui: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'var(--nina-canvas)',
    color: '#182334',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  loadingScreen: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--nina-canvas)',
    gap: 20,
  },
  spinner: {
    width: 48,
    height: 48,
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(24,35,52,0.08)',
    borderTopColor: '#10b981',
    borderRadius: '50%',
    animation: 'spin 0.9s linear infinite',
    boxShadow: '0 0 28px rgba(16,185,129,0.25)',
  },

  toast: {
    position: 'fixed',
    bottom: 28,
    right: 28,
    background: 'var(--nina-surface)',
    border: '1px solid rgba(16, 185, 129, 0.5)',
    color: '#182334',
    padding: '14px 22px',
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 600,
    zIndex: 9999,
    boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(16,185,129,0.15)',
    backdropFilter: 'blur(12px)',
  },

  // ── Header ───────────────────────────────────────────────────
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 24px',
    background: 'var(--nina-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(24,35,52,0.08)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    flexWrap: 'wrap',
    gap: 10,
  },
  brandGroup: { display: 'flex', alignItems: 'center', gap: 12 },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(16, 185, 129, 0.22) 100%)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    flexShrink: 0,
  },
  brandTitleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  brandTitle: { fontSize: 16, fontWeight: 800, color: '#182334', letterSpacing: -0.3 },
  brandTagline: { fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  changeBusinessBtn: {
    padding: '3px 9px',
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 6,
    background: 'rgba(24,35,52,0.08)',
    border: '1px solid rgba(24,35,52,0.12)',
    color: '#596579',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  headerRight: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  connectionPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 12px',
    borderRadius: 20,
    border: '1px solid transparent',
    transition: 'all 0.15s ease',
    cursor: 'pointer',
  },
  statusDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  kpiPill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 12px',
    borderRadius: 9,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  },
  kpiValue: { fontSize: 14, fontWeight: 800, color: '#182334' },
  kpiLabel: { fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 },

  // ── Navigation ────────────────────────────────────────────────
  nav: {
    display: 'flex',
    gap: 2,
    padding: '6px 20px',
    background: 'var(--nina-surface)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(24,35,52,0.06)',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 16px',
    borderRadius: 9,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  navBtnActive: {
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#087f6b',
    boxShadow: 'inset 0 0 0 1px rgba(16, 185, 129, 0.35)',
  },

  mainContent: { flex: 1, minHeight: 'calc(100vh - 108px)', overflow: 'hidden' },

  // ── Inbox ─────────────────────────────────────────────────────
  inboxLayout: {
    display: 'flex',
    height: 'calc(100vh - 108px)',
    minHeight: 0,
    overflow: 'hidden',
  },
  inboxSidebar: {
    width: 340,
    flexShrink: 0,
    borderRight: '1px solid rgba(24,35,52,0.06)',
    background: 'var(--nina-surface)',
    display: 'flex',
    flexDirection: 'column',
  },
  searchWrapper: {
    padding: '10px 14px',
    borderBottom: '1px solid rgba(24,35,52,0.06)',
  },
  filterPillRow: {
    display: 'flex',
    gap: 4,
    padding: '7px 14px',
    borderBottom: '1px solid rgba(24,35,52,0.06)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  statusFilterBtn: {
    padding: '3px 8px',
    fontSize: 9.5,
    fontWeight: 700,
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.03)',
    color: '#64748b',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.12s ease',
  },
  statusFilterBtnActive: {
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#087f6b',
    border: '1px solid rgba(16, 185, 129, 0.4)',
  },
  threadScrollList: { flex: 1, overflowY: 'auto', padding: '5px' },
  emptyStateBlock: {
    padding: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 8,
  },

  threadCard: {
    padding: '11px 13px',
    borderRadius: 9,
    cursor: 'pointer',
    marginBottom: 3,
    border: '1px solid transparent',
    transition: 'all 0.12s ease',
  },
  threadCardSelected: {
    background: 'rgba(16, 185, 129, 0.09)',
    border: '1px solid rgba(16, 185, 129, 0.22)',
  },
  threadCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  clientName: { fontSize: 13.5, fontWeight: 700, color: '#182334' },
  sentimentBadge: {
    padding: '1px 6px',
    borderRadius: 5,
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  threadPreviewText: {
    fontSize: 11.5,
    color: '#64748b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: 5,
    lineHeight: 1.4,
  },
  threadMetaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  badgeTag: {
    padding: '2px 5px',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#fff',
    letterSpacing: 0.4,
  },

  // ── Chat Panel ────────────────────────────────────────────────
  chatPanel: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, rgba(5,10,22,0.85) 0%, rgba(7,13,26,0.9) 100%)',
    overflow: 'hidden',
  },
  noChatSelected: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 40,
  },
  chatTopBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    background: 'rgba(10, 18, 36, 0.75)',
    borderBottom: '1px solid rgba(24,35,52,0.06)',
    flexShrink: 0,
    gap: 10,
    flexWrap: 'wrap',
  },
  smallActionBtn: {
    padding: '5px 12px',
    borderRadius: 7,
    border: 'none',
    color: '#fff',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'filter 0.12s ease, transform 0.12s ease',
  },
  messagesArea: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '18px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  msgBubble: {
    maxWidth: '70%',
    padding: '9px 15px',
    borderRadius: 16,
    fontSize: 13.5,
    lineHeight: 1.55,
    position: 'relative',
  },
  msgIncoming: {
    alignSelf: 'flex-start',
    background: 'rgba(22, 32, 56, 0.92)',
    border: '1px solid rgba(24,35,52,0.08)',
    borderBottomLeftRadius: 4,
    color: '#334155',
  },
  msgOutgoing: {
    alignSelf: 'flex-end',
    background: 'linear-gradient(135deg, rgba(5, 101, 71, 0.8) 0%, rgba(4, 78, 56, 0.85) 100%)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderBottomRightRadius: 4,
    color: '#ecfdf5',
  },
  msgTime: { fontSize: 9.5, color: 'rgba(148, 163, 184, 0.7)', textAlign: 'right', marginTop: 5 },

  draftBox: {
    padding: '12px 18px',
    background: 'rgba(217, 119, 6, 0.08)',
    borderTop: '1px solid rgba(245, 158, 11, 0.25)',
    flexShrink: 0,
  },

  replyInputBar: {
    display: 'flex',
    gap: 8,
    padding: '12px 18px',
    background: 'rgba(6, 12, 26, 0.9)',
    borderTop: '1px solid rgba(24,35,52,0.06)',
    alignItems: 'center',
    flexShrink: 0,
  },
  inputField: {
    flex: 1,
    padding: '9px 13px',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.09)',
    background: 'rgba(15, 25, 48, 0.8)',
    color: '#182334',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  },
  sendBtn: {
    padding: '9px 18px',
    borderRadius: 9,
    border: 'none',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'filter 0.12s ease',
    flexShrink: 0,
    boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
  },
  quickReplyBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    border: '1px solid rgba(24,35,52,0.12)',
    background: 'rgba(20, 30, 60, 0.8)',
    color: '#f59e0b',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.12s ease',
  },
  quickDrawer: {
    padding: '12px 18px',
    background: 'rgba(6, 12, 26, 0.97)',
    borderTop: '1px solid rgba(24,35,52,0.08)',
    flexShrink: 0,
  },
  quickChip: {
    padding: '8px 11px',
    borderRadius: 7,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(15, 25, 50, 0.7)',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.12s ease',
  },

  // ── Catalog ───────────────────────────────────────────────────
  catalogGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  productCard: {
    padding: 18,
    borderRadius: 13,
    background: 'rgba(12, 22, 42, 0.7)',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'border-color 0.18s ease, transform 0.18s ease',
  },
  categoryTag: { fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 },
  bestsellerTag: {
    fontSize: 9,
    fontWeight: 800,
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16,185,129,0.25)',
    padding: '1px 6px',
    borderRadius: 4,
    letterSpacing: 0.4,
  },
  watchName: { fontSize: 15, fontWeight: 700, color: '#182334', marginTop: 5, marginBottom: 6 },
  watchDesc: { fontSize: 11.5, color: '#64748b', lineHeight: 1.5, flex: 1, marginBottom: 12 },
  priceRow: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  watchPrice: { fontSize: 19, fontWeight: 800, color: '#10b981' },
  watchMrp: { fontSize: 12, color: '#475569', textDecoration: 'line-through' },
  featureList: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 13 },
  featureChip: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 4,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    color: '#596579',
  },
  stockActionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTop: '1px solid rgba(24,35,52,0.06)',
    marginTop: 'auto',
  },
  stockToggleBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'filter 0.12s ease',
  },

  // ── Settings ──────────────────────────────────────────────────
  settingsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
  settingsCard: {
    padding: 20,
    borderRadius: 13,
    background: 'var(--nina-surface)',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  cardSectionHeader: { margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#182334' },
  formRow: { marginBottom: 13 },
  fieldLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  presetOption: {
    padding: '11px 13px',
    borderRadius: 9,
    border: '1px solid rgba(24,35,52,0.08)',
    cursor: 'pointer',
    transition: 'all 0.14s ease',
  },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },

  // ── Stats / Analytics ─────────────────────────────────────────
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
  statCard: {
    padding: 20,
    borderRadius: 13,
    background: 'var(--nina-surface)',
    border: '1px solid rgba(255,255,255,0.07)',
    transition: 'border-color 0.15s ease',
  },
  statBigNum: { fontSize: 30, fontWeight: 800, color: '#182334', marginBottom: 4 },
  statSub: { fontSize: 12, color: '#64748b', fontWeight: 600 },

  // ── Buttons ───────────────────────────────────────────────────
  primaryBtn: {
    padding: '9px 20px',
    borderRadius: 9,
    border: 'none',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'filter 0.12s ease, transform 0.12s ease',
    boxShadow: '0 4px 14px rgba(16,185,129,0.28)',
  },
  secondaryBtn: {
    padding: '9px 16px',
    borderRadius: 9,
    border: '1px solid rgba(24,35,52,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#596579',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.12s ease',
  },
  cancelBtn: {
    padding: '9px 16px',
    borderRadius: 9,
    border: '1px solid rgba(24,35,52,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#596579',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '9px 20px',
    borderRadius: 9,
    border: 'none',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(16,185,129,0.28)',
  },
  filterBtn: {
    padding: '6px 12px',
    borderRadius: 7,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.03)',
    color: '#64748b',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.12s ease',
  },
  filterBtnActive: {
    background: 'rgba(16,185,129,0.15)',
    border: '1px solid rgba(16,185,129,0.35)',
    color: '#087f6b',
  },

  // ── Modals ────────────────────────────────────────────────────
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: 26,
    borderRadius: 18,
    background: 'linear-gradient(145deg, #0d1b32 0%, #08111f 100%)',
    border: '1px solid rgba(24,35,52,0.12)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.85)',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { margin: 0, color: '#182334', fontSize: 17, fontWeight: 800 },
  modalCloseBtn: {
    background: 'rgba(24,35,52,0.08)',
    border: '1px solid rgba(24,35,52,0.12)',
    color: '#596579',
    fontSize: 16,
    cursor: 'pointer',
    borderRadius: 7,
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Connect / Device Card ─────────────────────────────────────
  connectCard: {
    padding: 28,
    borderRadius: 18,
    background: 'rgba(8, 16, 32, 0.8)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
  },
  linkedBox: {
    padding: 22,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(4, 78, 56, 0.12) 100%)',
    border: '1px solid rgba(16, 185, 129, 0.22)',
  },
};
