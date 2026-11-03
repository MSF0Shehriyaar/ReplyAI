'use client';

import { MessageSquare, ShoppingBag, Package, Building2, SlidersHorizontal, BarChart3, Link2, ShieldCheck, Trash2, RefreshCw } from 'lucide-react';
import { mapSearch, mapDirections, mapQuery } from '../lib/map-links';
import ConnectView from './device-connection';
import CatalogView from './dashboard-catalog';
import PublicationSettings from './catalog-publication';
import BusinessSettingsView from './business-profile';
import AIBrainSettingsView from './automation-settings';
import {missingBusinessProfile} from '../lib/business-profile';
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
} from '../lib/model';
import { initialWAWorkspace, waDefaults } from '../lib/model';

// ── API Helpers ─────────────────────────────────────────────────────────

async function api(base:string,action: string, body?: any) {
  const res = await fetch(base+'/workspace', {
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

async function loadWorkspace(base:string,tenantId?: string): Promise<WAWorkspace> {
  const res = await fetch(`${base}/workspace?_t=${Date.now()}${tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ''}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
  });
  if (!res.ok) { const error:any=await res.json().catch(()=>({})); throw Object.assign(new Error(error.error || 'Failed to load workspace'),{status:res.status}); }
  return res.json();
}

const getGoogleMapsSearchUrl=mapSearch;
const getGoogleMapsDirectionsUrl=mapDirections;
const navigationIcons:Record<string,React.ElementType>={inbox:MessageSquare,orders:ShoppingBag,catalog:Package,business:Building2,brain:SlidersHorizontal,analytics:BarChart3,connect:Link2,};

// ── Main Command Center ─────────────────────────────────────────────────

type DashboardTab='inbox'|'orders'|'catalog'|'business'|'brain'|'analytics'|'connect';
type DashboardProps={onSessionExpired:()=>void;identity:{businessName:string;userName:string};apiBase?:string;catalogBase?:string;tenantId?:string;requireProfile?:boolean;onExit?:()=>void;initialTab?:DashboardTab;aiStatus?:{heading:string;description:string}};
export default function BusinessDashboard({onSessionExpired,identity,apiBase='/business/api',catalogBase='/business/catalog',tenantId,requireProfile=true,onExit,initialTab='inbox',aiStatus}:DashboardProps) {
  const [workspace, setWorkspace] = useState<WAWorkspace>(initialWAWorkspace);
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [selectedThread, setSelectedThread] = useState<WAThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const [waStatus, setWaStatus] = useState<any>(null);
  const [activeTenantId,setActiveTenantId]=useState<string|undefined>(tenantId);
  const scopeVersion=useRef(0);
  const [workspaceError,setWorkspaceError]=useState('');
  const pollPaused=useRef(false);

  const refresh = useCallback(async () => {
    try {
      const version=scopeVersion.current;
      const data = await loadWorkspace(apiBase,activeTenantId);
      if(version!==scopeVersion.current) return;
      pollPaused.current = false;
      setWorkspace(data as any);
      setWorkspaceError('');
      if (!activeTenantId && data.activeAccountId) {
        setActiveTenantId(data.activeAccountId);
      }
    } catch (e: any) {
      setWorkspaceError(e.message);
      if(e.status===401 || e.status===403) { setWorkspace(initialWAWorkspace); setWaStatus(null); onSessionExpired(); }
      else pollPaused.current=true;
    } finally {
      setLoading(false);
    }
  }, [activeTenantId,onSessionExpired,apiBase]);

  const refreshConnect = useCallback(async () => {
    try {
      const version=scopeVersion.current;
      const res = await fetch(apiBase+'/connect'+(activeTenantId?'?tenantId='+encodeURIComponent(activeTenantId):''));
      if (res.ok) {const data=await res.json(); if(version===scopeVersion.current) setWaStatus(data);}
      else if(res.status===401 || res.status===403) onSessionExpired();
      else {pollPaused.current=true;setWorkspaceError('Connection status is unavailable. Please retry.');}
    } catch {}
  }, [activeTenantId,apiBase,onSessionExpired]);

  useEffect(() => {
    refresh();
    refreshConnect();
    const interval = setInterval(() => {
      if(document.hidden || pollPaused.current)return;
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
      if(['connect','disconnect','logout'].includes(action)) {
        const response=await fetch(apiBase+'/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,tenantId:activeTenantId})});
        if(!response.ok) throw new Error((await response.json() as {error?:string}).error);
      } else {
        if(action==='save-order' && body?.order?.deliveryLocation?.raw) {
          const response=await fetch(apiBase+'/location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId:activeTenantId,address:body.order.deliveryLocation.raw})});
          const result:any=await response.json();
          if(!response.ok) throw new Error(result.error || 'Could not check delivery address');
          body={...body,order:{...body.order,deliveryLocation:result.location}};
        }
        await api(apiBase,action, {tenantId:activeTenantId,...body});
      }
      await refresh();
      showToast('Changes saved');
      return true;
    } catch (e: any) {
      showToast('Error: ' + e.message);
      return false;
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
  const themeColor = !activeBiz.themeColor||activeBiz.themeColor==='#10b981'?'#6550c8':activeBiz.themeColor;

  // Filter threads
  const filteredThreads = (workspace.threads || []).filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const tName = (t.name || (t as any).customerName || t.customerProfile?.name || '').toLowerCase();
      const tPhone = (t.phone || (t as any).customerPhone || t.customerProfile?.phone || '');
      return (
        tName.includes(q) ||
        tPhone.includes(q) ||
        (t.messages || []).some((m) => (m.text || '').toLowerCase().includes(q))
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
            Opening {identity.businessName}…
          </p>
        </div>
      </div>
    );
  }

  if(workspaceError&&!workspace.storageReady)return <main className="wa-settings-page"><h1>{identity.businessName} is unavailable</h1><p role="alert">{workspaceError}</p><button className="wa-settings-action" onClick={()=>{setLoading(true);pollPaused.current=false;void refresh();}}>Retry {identity.businessName}</button></main>;

  if(!workspaceError&&requireProfile&&workspace.userRole!=='business_operator'&&missingBusinessProfile(currentSettings).length) {
    return <div className="wa-app wa-dashboard"><BusinessSettingsView key={workspace.activeAccountId} settings={currentSettings} userName={identity.userName} initial onSave={updated=>doAction('save-profile',{settings:updated})}/>{toast&&<p role="status" style={ui.toast}>{toast}</p>}<button className="wa-profile-signout" onClick={async()=>{await fetch(apiBase+'/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});onSessionExpired();}}>Sign out {identity.userName}</button></div>;
  }

  const navTabs = [
    { id: 'inbox', label: 'Live Inbox', icon: '' },
    { id: 'orders', label: 'Orders & Live Map', icon: '' },
    { id: 'catalog', label: 'Products & Catalog', icon: '' },
    { id: 'business', label: 'Store Profile', icon: '' },
    { id: 'brain', label: 'AI Behavior & Tone', icon: '' },
    { id: 'analytics', label: 'Analytics & Leads', icon: '' },
    { id: 'connect', label: 'WhatsApp Device', icon: '' },
  ];

  return (
    <div className="wa-app wa-dashboard" style={ui.root}>
      {/* Toast Notification */}
      {toast && <div style={ui.toast}>{toast}</div>}

      {/* Header Bar */}
      <header className="wa-top-header" style={ui.header}>
        <div style={ui.brandGroup}>
          <div
            style={{
              ...ui.brandIcon,
              borderColor: `${themeColor}60`,
              background: 'var(--workspace-soft)',
              boxShadow: `0 0 16px ${themeColor}28`,
            }}
          ><MessageSquare size={20} aria-hidden="true"/></div>
          <div>
            <div style={ui.brandTitleRow}>
              <span style={ui.brandTitle}>{currentSettings.businessName}</span>
              <button
                className="wa-business-edit"
                onClick={() => setShowBusinessModal(true)}
                style={{
                  ...ui.changeBusinessBtn,
                  borderColor: `${themeColor}40`,
                  background: `${themeColor}10`,
                  color: themeColor,
                }}
                title="Customize business profile"
              >
                Edit {currentSettings.businessName}
              </button>
            </div>
            <span style={ui.brandTagline}>{currentSettings.tagline}</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="wa-top-actions" style={ui.headerRight}>
          {/* Visual Catalog */}
          <a
            className="wa-business-catalog-link"
            href={workspace.catalogPublication?.published?catalogBase+'/'+encodeURIComponent(workspace.catalogPublication.slug):'#'}
            onClick={event=>{if(!workspace.catalogPublication?.published){event.preventDefault();setActiveTab('catalog');}}}
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
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
             Catalog 
          </a>

          <button onClick={async()=>{
            if(onExit){onExit();return;}
            const response=await fetch(apiBase+'/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
            if(response.ok)onSessionExpired();
          }} style={ui.secondaryBtn}>{onExit?'Back to workspaces':'Sign out '+identity.userName}</button>

          {/* WhatsApp Connection Status */}
          <div
            className="wa-connection-status"
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

          <div className="wa-product-kpi" style={ui.kpiPill}>
            <span style={ui.kpiValue}>{currentSettings.catalog?.length ?? 0}</span>
            <span style={ui.kpiLabel}>Products</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      {missingBusinessProfile(currentSettings).length>0&&<section className="wa-setup-readiness"><div><strong>{currentSettings.businessName} · automation setup</strong><p>Mandatory before enabling automatic replies: {missingBusinessProfile(currentSettings).join(', ')}. A connected WhatsApp number and an available AI provider are also required. Publishing a catalog is optional.</p></div><button onClick={()=>setActiveTab('business')}>Complete profile</button><button onClick={()=>setActiveTab('connect')}>Connect WhatsApp</button></section>}
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

      <div
        className="wa-ai-status"
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          padding: '14px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          color: '#334155',
        }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <strong style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b' }}>
            {aiStatus?.heading || (!currentSettings.enabled
              ? 'Automatic replies paused'
              : !workspace.connections.aiVerified
              ? 'Administrator AI setup required'
              : currentSettings.approval
              ? 'AI drafts require approval'
              : 'Automatic replies enabled')}
          </strong>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '3px 0 0', color: '#64748b' }}>
            {aiStatus?.description || (!currentSettings.enabled
              ? 'Enable replies in AI settings when your business is ready.'
              : !workspace.connections.aiVerified
              ? 'Your AI service is unavailable. Contact support.'
              : currentSettings.approval
              ? 'Review and send generated drafts from your inbox.'
              : 'Replies use the administrator’s shared AI service and your business catalog.')}
            {!workspace.connections.whatsappVerified ? ' Connect WhatsApp to receive and send messages.' : ''}
          </p>
        </div>
        <div className="wa-ai-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('brain')}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #e0d5f8',
              background: '#ffffff',
              color: '#7354da',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            AI settings
          </button>
          {!!((workspace.queue?.pending || 0) + (workspace.queue?.failed || 0)) && workspace.userRole !== 'business_operator' && (
            <button
              onClick={() => void doAction('retry-queue')}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry replies ({(workspace.queue?.pending || 0) + (workspace.queue?.failed || 0)})
            </button>
          )}
        </div>
      </div>

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
          <div><PublicationSettings catalogBase={catalogBase} key={(workspace.activeAccountId||'')+workspace.catalogPublication?.slug+workspace.catalogPublication?.published} publication={workspace.catalogPublication?{...workspace.catalogPublication,url:catalogBase+'/'+encodeURIComponent(workspace.catalogPublication.slug)}:undefined} onSave={(slug,published)=>doAction('save-catalog-publication',{slug,published})}/><CatalogView key={workspace.activeAccountId}
            catalog={currentSettings.catalog}
            categories={currentSettings.categories}
            onSave={(newCat,categories) => doAction('save-catalog', {catalog:newCat,categories})}
          /></div>
        )}
        {activeTab === 'business' && (
          <BusinessSettingsView key={workspace.activeAccountId}
            settings={currentSettings}
            onSave={(updated) => doAction('save-profile', { settings: updated })}
          />
        )}
        {activeTab === 'brain' && (
          <AIBrainSettingsView key={workspace.activeAccountId}
            settings={currentSettings}
            onSave={(updated) => doAction('save-automation', { settings: updated })}
            onTest={async text=>(await api(apiBase,'test-ai',{tenantId:activeTenantId,text}) as {reply:string}).reply}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsView analytics={workspace.analytics} threads={workspace.threads || []} />
        )}
        {activeTab === 'connect' && (
          <ConnectView apiBase={apiBase} tenantId={activeTenantId} businessName={currentSettings.businessName} waStatus={waStatus} onAction={doAction} onRefresh={refreshConnect} />
        )}
      </main>

      {workspaceError && <div role="alert" className="wa-workspace-error">{workspaceError}<button onClick={()=>{pollPaused.current=false;void refresh();void refreshConnect();}}>Retry</button></div>}
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
  onAction: (action: string, body?: any) => Promise<unknown>;
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
                    {t.customerProfile?.vip && '⭐ '}
                    {t.name || (t as any).customerName || t.customerProfile?.name || 'Customer'}
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
                    <span style={{ color: '#64748b', fontSize: 12 }}>{t.phone || (t as any).customerPhone || t.customerProfile?.phone || ''}</span>
                    {((t.tags || (t as any).customerProfile?.tags || [])).includes('order_confirmed') && (
                      <span
                        style={{
                          fontSize: 12,
                          background: 'rgba(16, 185, 129, 0.25)',
                          color: '#087f6b',
                          border: '1px solid #10b981',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        ✓ CONFIRMED
                      </span>
                    )}
                    {t.deliveryLocation && (
                      <span
                        style={{
                          fontSize: 12,
                          background: t.deliveryLocation.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: t.deliveryLocation.verified ? '#087f6b' : '#96610a',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                         {t.deliveryLocation.verified ? 'Confirmed' : 'Review location'}
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
            <MessageSquare size={40} strokeWidth={1.4} aria-hidden="true" style={{color:"#8795a8",marginBottom:12}} />
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
                  <span style={{ fontSize: 12, color: '#64748b' }}>{selectedThread.phone}</span>
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
                    background: 'var(--workspace-surface)',
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
                      fontSize: 12,
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
                              fontSize: 12,
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
                            fontSize: 12,
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
                          fontSize: 12,
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
                        fontSize: 12,
                        color: '#475569',
                      }}
                    >
                      {threadOrder && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#596579' }}>
                          <span>Product: <b style={{ color: '#182334' }}>{threadOrder.productName}</b></span>
                          <span>Payment: <b style={{ color: '#38bdf8' }}>{threadOrder.paymentMode}</b> ({threadOrder.paymentStatus})</span>
                          {threadOrder.courierPartner && <span>Courier: <b style={{ color: '#6550a8' }}>{threadOrder.courierPartner}</b> ({threadOrder.trackingNumber || 'Tracking pending'})</span>}
                        </div>
                      )}

                      {loc && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ color: '#182334', fontWeight: 500 }}>{loc.raw}</div>
                            {loc.lat && loc.lng && (
                              <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
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
                                background: 'var(--workspace-surface)',
                                color: '#fff',
                                padding: '3px 8px',
                                borderRadius: 5,
                                fontSize: 12,
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
                                fontSize: 12,
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
                  className={m.role==='outgoing'?'wa-message-outgoing':'wa-message-incoming'}
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#956213' }}> AI CONSULTATIVE DRAFT</span>
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
              ><MessageSquare size={18} aria-hidden="true" /></button>

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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#956213', marginBottom: 8 }}>
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
                      <div style={{ color: '#596579', fontSize: 12, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
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




// ════════════════════════════════════════════════════════════════════════
// ── STORE & BUSINESS PROFILE ────────────────────────────────────────────
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
      <h2 style={{ margin: '0 0 20px', fontSize: 22, color: '#182334', fontWeight: 700 }}> Live Performance & Leads</h2>

      <div style={ui.statsGrid}>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
          <div style={ui.statBigNum}>{threads.length}</div>
          <div style={ui.statSub}>Total Client Inquiries</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
          <div style={{ ...ui.statBigNum, color: '#956213' }}>
            {threads.filter((t) => ((t.tags || (t as any).customerProfile?.tags || [])).includes('hot_lead') || ((t.tags || (t as any).customerProfile?.tags || [])).includes('order_inquiry')).length}
          </div>
          <div style={ui.statSub}>High Intent / Ready to Buy</div>
        </div>
        <div style={ui.statCard}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
          <div style={{ ...ui.statBigNum, color: '#0d7357' }}>
            {threads.filter((t) => t.customerProfile?.vip || ((t.tags || (t as any).customerProfile?.tags || [])).includes('luxury_buyer')).length}
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
  const [agentName, setAgentName] = useState(settings.profile?.name || 'Support');

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
              placeholder="e.g. Customer Support"
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
            <h2 style={{ margin: 0, fontSize: 22, color: '#182334', fontWeight: 700 }}>
               Confirmed Orders & Live Delivery Radar
            </h2>
            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#087f6b', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>
              GPS Geocoded & Mapped
            </span>
          </div>
          <p style={{ color: '#596579', fontSize: 13, marginTop: 4 }}>
            Track orders, review customer addresses, and confirm delivery map positions before dispatch.
          </p>
        </div>

        <button onClick={() => setShowCreateModal(true)} style={ui.primaryBtn}>
          + Create Manual Order
        </button>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={ui.statCard}>
          <div style={{ fontSize: 12, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>Total Orders</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#182334', marginTop: 4 }}>{orders.length}</div>
          <div style={{ fontSize: 12, color: '#0d7357', marginTop: 2 }}>₹{totalRevenue.toLocaleString('en-IN')} Total Value</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 12, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>Ready for Dispatch</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#087f6b', marginTop: 4 }}>{readyCount}</div>
          <div style={{ fontSize: 12, color: '#596579', marginTop: 2 }}>Delivery details</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 12, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>In Transit / Dispatched</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>{dispatchedCount}</div>
          <div style={{ fontSize: 12, color: '#596579', marginTop: 2 }}>With Courier Partner</div>
        </div>

        <div style={ui.statCard}>
          <div style={{ fontSize: 12, color: '#596579', fontWeight: 700, textTransform: 'uppercase' }}>Missing PIN Code</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: missingPinCount > 0 ? '#f59e0b' : '#64748b', marginTop: 4 }}>
            {missingPinCount}
          </div>
          <div style={{ fontSize: 12, color: missingPinCount > 0 ? '#96610a' : '#64748b', marginTop: 2 }}>
            {missingPinCount > 0 ? 'Action required from client' : 'Postal codes supplied'}
          </div>
        </div>
      </div>

      {/* Live Map & Active Order Radar Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 16,
          background: 'var(--workspace-surface)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 24,
        }}
      >
        {/* Left: Embedded Google Map */}
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', minHeight: 280, border: '1px solid rgba(24,35,52,0.12)' }}>
          {selectedOrder && mapQuery(selectedOrder.deliveryLocation) ? <iframe title="Delivery address map"
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 0, width: '100%', height: '100%', minHeight: 280 }}
            src={`https://www.google.com/maps?q=${encodeURIComponent(
              mapQuery(selectedOrder?.deliveryLocation)
            )}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer"
          /> : <div style={{display:'grid',placeContent:'center',minHeight:280,padding:24,textAlign:'center',color:'var(--workspace-text-secondary)'}}><strong>No delivery address selected</strong><p>Select an order with a delivery address to view its map.</p></div>}
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: 'var(--workspace-surface)',
              backdropFilter: 'blur(8px)',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              color: '#087f6b',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
             Delivery address map{selectedOrder ? ' · '+selectedOrder.id : ''}
          </div>
        </div>

        {/* Right: Selected Order Detail Radar */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {selectedOrder ? (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0d7357', textTransform: 'uppercase' }}>
                      {selectedOrder.id} · {selectedOrder.orderStatus.replace(/_/g, ' ')}
                    </span>
                    <h3 style={{ margin: '4px 0 0', fontSize: 18, color: '#182334', fontWeight: 700 }}>
                      {selectedOrder.customerName}
                    </h3>
                    <div style={{ color: '#596579', fontSize: 12 }}>{selectedOrder.customerPhone}</div>
                  </div>

                  <span
                    style={{
                      background: selectedOrder.deliveryLocation?.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: selectedOrder.deliveryLocation?.verified ? '#087f6b' : '#96610a',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 6,
                    }}
                  >
                    {selectedOrder.deliveryLocation?.verified ? ' ADDRESS CONFIRMED' : ' NEEDS REVIEW'}
                  </span>
                </div>

                {/* Product & Payment */}
                <div style={{ background: 'var(--workspace-surface)', borderRadius: 8, padding: 12, margin: '14px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#182334', fontSize: 14 }}>{selectedOrder.productName}</span>
                    <span style={{ fontWeight: 700, color: '#087f6b', fontSize: 16 }}>
                      ₹{selectedOrder.amount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* If bulk order with itemized list */}
                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                      <div style={{ fontSize: 12, color: '#596579', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                         Itemized Timepieces ({selectedOrder.quantity || selectedOrder.items.length} units):
                      </div>
                      {selectedOrder.items.map((it, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', padding: '2px 0' }}>
                          <span>• {it.productName} × {it.quantity}</span>
                          <span style={{ color: '#087f6b', fontWeight: 600 }}>₹{it.totalPrice.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {selectedOrder.subtotal && selectedOrder.discountAmount ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#96610a', marginTop: 4, borderTop: '1px dashed rgba(24,35,52,0.12)', paddingTop: 4 }}>
                          <span>Subtotal: ₹{selectedOrder.subtotal.toLocaleString('en-IN')}</span>
                          <span>VIP {selectedOrder.discountCode || 'TITAN10'}: −₹{selectedOrder.discountAmount.toLocaleString('en-IN')}</span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 12, color: '#596579', flexWrap: 'wrap' }}>
                    <span>Payment: <b style={{ color: '#182334' }}>{selectedOrder.paymentMode}</b> ({selectedOrder.paymentStatus})</span>
                    {selectedOrder.discountCode && <span>Promo: <b style={{ color: '#96610a' }}>{selectedOrder.discountCode}</b></span>}
                    {selectedOrder.courierPartner && <span>Courier: <b style={{ color: '#2563eb' }}>{selectedOrder.courierPartner}</b></span>}
                  </div>
                </div>

                {/* Delivery Address & GPS Coordinates */}
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
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
                    <div style={{ color: '#596579', fontSize: 12, marginTop: 2 }}>
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
                      background: 'var(--workspace-surface)',
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
                    background: 'var(--workspace-surface)',
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
                      <span style={{ fontWeight: 700, color: '#087f6b', fontSize: 14 }}>{ord.id}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {new Date(ord.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span
                        style={{
                          background: ord.deliveryLocation?.verified ? '#065f46' : '#78350f',
                          color: ord.deliveryLocation?.verified ? '#a7f3d0' : '#fde68a',
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {ord.deliveryLocation?.verified ? `PIN: ${ord.deliveryLocation.pincode}` : 'REVIEW LOCATION'}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, color: '#182334', fontSize: 15, marginTop: 4 }}>
                      {ord.customerName} · <span style={{ color: '#596579', fontWeight: 500 }}>{ord.customerPhone}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#087f6b', fontSize: 16 }}>₹{ord.amount.toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: 12, color: '#596579' }}>{ord.paymentMode} ({ord.paymentStatus})</div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--workspace-surface)', padding: '8px 12px', borderRadius: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#334155' }}>
                     <b style={{ color: '#182334' }}>{ord.productName}</b>
                    {ord.quantity && ord.quantity > 1 && (
                      <span style={{ marginLeft: 8, background: '#d97706', color: '#000', fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
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
                      style={{ ...ui.inputField, width: 130, padding: '5px 8px', fontSize: 12 }}
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
                      style={{ ...ui.inputField, width: 160, padding: '5px 8px', fontSize: 12 }}
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
                      style={{ ...ui.smallActionBtn, background: '#2563eb', padding: '5px 10px', fontSize: 12 }}
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
                        style={{ ...ui.smallActionBtn, background: 'var(--workspace-surface)', border: '1px solid #334155', color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      >
                         Map
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToChat(ord.threadId);
                      }}
                      style={{ ...ui.smallActionBtn, background: 'var(--workspace-surface)', border: '1px solid #334155', color: '#087f6b' }}
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
                    aria-label="Delete order"><Trash2 size={16} aria-hidden="true" /></button>
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

const ui: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'var(--workspace-canvas)',
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
    background: 'var(--workspace-canvas)',
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
    background: 'var(--workspace-surface)',
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
    background: 'var(--workspace-surface)',
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
  brandTitle: { fontSize: 16, fontWeight: 700, color: '#182334', letterSpacing: -0.3 },
  brandTagline: { fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  changeBusinessBtn: {
    padding: '3px 9px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    background: 'var(--workspace-surface)',
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
  kpiValue: { fontSize: 14, fontWeight: 700, color: '#182334' },
  kpiLabel: { fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 },

  // ── Navigation ────────────────────────────────────────────────
  nav: {
    display: 'flex',
    gap: 2,
    padding: '6px 20px',
    background: 'var(--workspace-surface)',
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
    background: 'var(--workspace-surface)',
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  threadPreviewText: {
    fontSize: 12,
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
    fontSize: 12,
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
    background: 'var(--workspace-soft)',
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
    background: 'var(--workspace-surface)',
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
    fontSize: 12,
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
    fontSize: 13.5,
    lineHeight: 1.55,
    position: 'relative',
  },
  msgIncoming: {
    alignSelf: 'flex-start',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px 16px 16px 4px',
    color: '#0f172a',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  msgOutgoing: {
    alignSelf: 'flex-end',
    background: '#f1eefb',
    border: '1px solid #ddd6fe',
    borderRadius: '16px 16px 4px 16px',
    color: '#1e1b4b',
    boxShadow: '0 1px 2px rgba(115, 84, 218, 0.05)',
  },
  msgTime: { fontSize: 11, color: '#64748b', textAlign: 'right', marginTop: 5, fontWeight: 500 },

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
    background: 'var(--workspace-surface)',
    borderTop: '1px solid rgba(24,35,52,0.06)',
    alignItems: 'center',
    flexShrink: 0,
  },
  inputField: {
    flex: 1,
    padding: '9px 13px',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.09)',
    background: 'var(--workspace-surface)',
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
    background: 'var(--workspace-accent)',
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
    background: 'var(--workspace-surface)',
    color: '#956213',
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
    background: 'var(--workspace-surface)',
    borderTop: '1px solid rgba(24,35,52,0.08)',
    flexShrink: 0,
  },
  quickChip: {
    padding: '8px 11px',
    borderRadius: 7,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'var(--workspace-surface)',
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
    background: 'var(--workspace-surface)',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'border-color 0.18s ease, transform 0.18s ease',
  },
  categoryTag: { fontSize: 12, fontWeight: 700, color: '#956213', textTransform: 'uppercase', letterSpacing: 0.5 },
  bestsellerTag: {
    fontSize: 12,
    fontWeight: 700,
    color: '#0d7357',
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16,185,129,0.25)',
    padding: '1px 6px',
    borderRadius: 4,
    letterSpacing: 0.4,
  },
  watchName: { fontSize: 15, fontWeight: 700, color: '#182334', marginTop: 5, marginBottom: 6 },
  watchDesc: { fontSize: 12, color: '#64748b', lineHeight: 1.5, flex: 1, marginBottom: 12 },
  priceRow: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  watchPrice: { fontSize: 19, fontWeight: 700, color: '#0d7357' },
  watchMrp: { fontSize: 12, color: '#475569', textDecoration: 'line-through' },
  featureList: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 13 },
  featureChip: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'filter 0.12s ease',
  },

  // ── Settings ──────────────────────────────────────────────────
  settingsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 },
  settingsCard: {
    padding: 20,
    borderRadius: 13,
    background: 'var(--workspace-surface)',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  cardSectionHeader: { margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#182334' },
  formRow: { marginBottom: 13 },
  fieldLabel: {
    display: 'block',
    fontSize: 12,
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
    background: 'var(--workspace-surface)',
    border: '1px solid rgba(255,255,255,0.07)',
    transition: 'border-color 0.15s ease',
  },
  statBigNum: { fontSize: 30, fontWeight: 700, color: '#182334', marginBottom: 4 },
  statSub: { fontSize: 12, color: '#64748b', fontWeight: 600 },

  // ── Buttons ───────────────────────────────────────────────────
  primaryBtn: {
    padding: '9px 20px',
    borderRadius: 9,
    border: 'none',
    background: 'var(--workspace-accent)',
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
    background: 'var(--workspace-accent)',
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
    fontSize: 12,
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
    background: 'var(--workspace-surface)',
    border: '1px solid rgba(24,35,52,0.12)',
    boxShadow: '0 24px 80px rgba(24,35,52,0.18)',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { margin: 0, color: '#182334', fontSize: 17, fontWeight: 700 },
  modalCloseBtn: {
    background: 'var(--workspace-surface)',
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
    background: 'var(--workspace-surface)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: 'var(--workspace-shadow)',
  },
  linkedBox: {
    padding: 22,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(4, 78, 56, 0.12) 100%)',
    border: '1px solid rgba(16, 185, 129, 0.22)',
  },
};
