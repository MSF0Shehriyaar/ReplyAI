'use client';
import { useState } from 'react';
import { 
  FlaskConical, Check, AlertTriangle, ArrowUpRight, Camera, Link2, 
  Sparkles, Clock, Loader2, Play, Flame, ShieldAlert, Cpu, 
  Copy, RefreshCw, Sliders, CheckCircle2, MessageSquare, Terminal, 
  SendHorizontal, Zap, ShieldCheck
} from 'lucide-react';
import type { Workspace } from '@/lib/model';

type Result = { ok: boolean; text: string; at: number };
type ReplyData = {
  reply: string;
  durationMs: number;
  words: number;
  estimatedTokens?: number;
  isRefusal?: boolean;
  uncensored?: boolean;
};

async function request(path: string, method = 'GET', payload?: unknown) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-nina-client': '1' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error || 'This check failed.');
  return data;
}

export default function TestLab({ workspace: w, onReload }: { workspace: Workspace; onReload: () => Promise<unknown> }) {
  const [activeTab, setActiveTab] = useState<'playground' | 'providers' | 'instagram' | 'webhook' | 'pipeline'>('playground');
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState<Record<string, Result>>({});

  // Playground States
  const [message, setMessage] = useState('Hey, how was your day?');
  const [provider, setProvider] = useState('');
  const [account, setAccount] = useState('');
  const [channel, setChannel] = useState<'dm' | 'comment'>('dm');
  const [temperature, setTemperature] = useState(0.75);
  const [uncensoredMode, setUncensoredMode] = useState(false);
  const [customSystem, setCustomSystem] = useState('');
  const [postContext, setPostContext] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState<ReplyData | null>(null);

  // Webhook Simulator State
  const [simText, setSimText] = useState('Can you send me your pricing details?');
  const [simUser, setSimUser] = useState('test_client_99');

  async function run(id: string, fn: () => Promise<string>) {
    if (busy) return;
    setBusy(id);
    try {
      const text = await fn();
      setResults(prev => ({ ...prev, [id]: { ok: true, text, at: Date.now() } }));
      await onReload().catch(() => {});
    } catch (e) {
      setResults(prev => ({ ...prev, [id]: { ok: false, text: (e as Error).message, at: Date.now() } }));
    } finally {
      setBusy('');
    }
  }

  function result(id: string) {
    const r = results[id];
    return r ? (
      <div className={'check-result ' + (r.ok ? 'passed' : 'failed')} role="status">
        {r.ok ? <Check size={16} className="text-emerald-500" /> : <AlertTriangle size={16} className="text-rose-500" />}
        <div>
          <b>{r.ok ? 'Passed' : 'Needs attention'}</b>
          <p>{r.text}</p>
          <small>{new Date(r.at).toLocaleTimeString()}</small>
        </div>
      </div>
    ) : null;
  }

  const button = (id: string, label: string, fn: () => Promise<string>, primary = false) => (
    <button
      className={`button ${primary ? 'primary' : ''}`}
      disabled={!!busy || !w.storageReady}
      onClick={() => run(id, fn)}
    >
      {busy === id ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
      <span>{busy === id ? 'Running…' : label}</span>
    </button>
  );

  async function handleGeneratePreview() {
    if (!message.trim() || busy) return;
    setBusy('playground');
    try {
      const payload: any = {
        message: message.trim(),
        channel,
        temperature,
        uncensored: uncensoredMode,
      };
      if (account) payload.accountId = account;
      if (provider) payload.providerId = provider;
      if (customSystem.trim()) payload.systemPrompt = customSystem.trim();
      if (channel === 'comment' && postContext.trim()) payload.postContext = postContext.trim();

      const r: ReplyData = await request('/api/preview', 'POST', payload);
      setReply(r);
    } catch (err: any) {
      setResults(prev => ({
        ...prev,
        playground: { ok: false, text: err.message || 'Generation failed', at: Date.now() }
      }));
    } finally {
      setBusy('');
    }
  }

  function copyReply() {
    if (reply?.reply) {
      navigator.clipboard.writeText(reply.reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="test-lab-container">
      {/* Top Banner */}
      <div className="lab-header-banner">
        <div className="lab-header-left">
          <div className="lab-icon-circle">
            <FlaskConical size={24} />
          </div>
          <div>
            <h2>Individual Component Test Suite</h2>
            <p>
              Inspect and verify every layer independently: test unrestricted model generation, live API latencies, webhooks, and account permissions.
            </p>
          </div>
        </div>
        <div className="lab-status-badge">
          <span className="live-dot" />
          <span>Test Sandbox Active</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="test-lab-tabs">
        <button
          className={`lab-tab-btn ${activeTab === 'playground' ? 'active' : ''}`}
          onClick={() => setActiveTab('playground')}
        >
          <Zap size={16} />
          <span>Interactive Playground</span>
          {uncensoredMode && <span className="uncensored-pill">UNFILTERED</span>}
        </button>
        <button
          className={`lab-tab-btn ${activeTab === 'providers' ? 'active' : ''}`}
          onClick={() => setActiveTab('providers')}
        >
          <Cpu size={16} />
          <span>Models & API Keys</span>
          <span className="count-badge">{w.connections.providers?.length || 0}</span>
        </button>
        <button
          className={`lab-tab-btn ${activeTab === 'instagram' ? 'active' : ''}`}
          onClick={() => setActiveTab('instagram')}
        >
          <Camera size={16} />
          <span>Instagram Accounts</span>
          <span className="count-badge">{w.connections.accounts?.length || 0}</span>
        </button>
        <button
          className={`lab-tab-btn ${activeTab === 'webhook' ? 'active' : ''}`}
          onClick={() => setActiveTab('webhook')}
        >
          <Link2 size={16} />
          <span>Webhook Relay</span>
        </button>
        <button
          className={`lab-tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('pipeline')}
        >
          <Clock size={16} />
          <span>Automation Readiness</span>
        </button>
      </div>

      {/* TAB 1: INTERACTIVE PLAYGROUND */}
      {activeTab === 'playground' && (
        <div className="playground-layout">
          <div className="playground-controls settings-card">
            <div className="section-kicker">
              <Sparkles size={16} /> PROMPT & MODEL RUNNER
            </div>
            <h3>Test Model Response</h3>
            <p className="body-note">
              Simulate conversations directly. Private test only — nothing is published to Instagram.
            </p>

            {/* Uncensored Mode Switcher */}
            <div className={`uncensored-toggle-box ${uncensoredMode ? 'active' : ''}`}>
              <div className="uncensored-info">
                <div className="flex-row items-center gap-2">
                  <Flame size={18} className={uncensoredMode ? 'text-amber-500' : 'text-muted-foreground'} />
                  <b>Uncensored / Adult Creative Test Mode</b>
                </div>
                <p>
                  {uncensoredMode
                    ? 'Filters relaxed: prompts will not be refused by internal regex boundary rewrites.'
                    : 'Standard mode: explicit messages receive boundary responses suited for public profiles.'}
                </p>
              </div>
              <button
                type="button"
                className={`button toggle-pill-btn ${uncensoredMode ? 'primary' : 'secondary'}`}
                onClick={() => setUncensoredMode(!uncensoredMode)}
              >
                {uncensoredMode ? 'Active' : 'Enable'}
              </button>
            </div>

            {/* Target Selectors */}
            <div className="form-grid mt-4">
              <label className="field">
                <span>Model Connection</span>
                <select value={provider} onChange={e => setProvider(e.target.value)}>
                  <option value="">Current Shared API (Default)</option>
                  {w.connections.providers?.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {p.model} ({p.provider})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Instagram Profile Context</span>
                <select value={account} onChange={e => setAccount(e.target.value)}>
                  <option value="">Workspace Default Profile</option>
                  {w.connections.accounts?.map(a => (
                    <option key={a.id} value={a.id}>
                      @{a.username || 'New Account'}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Channel Switcher */}
            <div className="segmented mt-2">
              <button
                type="button"
                className={channel === 'dm' ? 'selected' : ''}
                onClick={() => setChannel('dm')}
              >
                Private DM
              </button>
              <button
                type="button"
                className={channel === 'comment' ? 'selected' : ''}
                onClick={() => setChannel('comment')}
              >
                Public Comment
              </button>
            </div>

            {/* Prompt Presets */}
            <div className="prompt-preset-section mt-4">
              <span className="preset-label">Quick Test Prompts:</span>
              <div className="prompt-chips">
                <button
                  type="button"
                  onClick={() => setMessage('Hey, how was your day?')}
                >
                  💬 Casual Greeting
                </button>
                <button
                  type="button"
                  onClick={() => setMessage('What are your naughty thoughts right now?')}
                >
                  🔥 Flirtatious / Romance
                </button>
                <button
                  type="button"
                  onClick={() => setMessage('fuck me baby, you look so hot')}
                >
                  ⚡ Direct NSFW Test
                </button>
                <button
                  type="button"
                  onClick={() => setMessage('aaj ka din kaisa tha, kuch exciting hua kya?')}
                >
                  🇮🇳 Hinglish Slang
                </button>
              </div>
            </div>

            {/* Reel / Post Context for Comments */}
            {channel === 'comment' && (
              <label className="field mt-3">
                <span>Reel / Post Content Context (optional)</span>
                <input
                  value={postContext}
                  onChange={e => setPostContext(e.target.value)}
                  placeholder="e.g. Red dress sunset walk at Marine Drive, golden hour lighting"
                />
                <small className="text-xs text-muted-foreground">Simulates a comment left on a specific reel so Nina replies with grounded scene awareness.</small>
              </label>
            )}

            {/* Incoming Message Textarea */}
            <label className="field mt-3">
              <span>Incoming Message</span>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Type any message, question, or roleplay prompt…"
              />
            </label>

            {/* Advanced Toggle */}
            <button
              type="button"
              className="text-button flex-row items-center gap-1 mt-2 text-xs"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Sliders size={13} />
              {showAdvanced ? 'Hide advanced generation settings' : 'Show advanced generation settings (temperature, system prompt)'}
            </button>

            {showAdvanced && (
              <div className="advanced-settings-panel">
                <label className="field">
                  <span>Temperature: {temperature}</span>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={temperature}
                    onChange={e => setTemperature(parseFloat(e.target.value))}
                  />
                  <div className="range-labels">
                    <span>Precise / Focused (0.0)</span>
                    <span>Creative / Wild (1.5)</span>
                  </div>
                </label>

                <label className="field mt-2">
                  <span>Custom System Instructions Override</span>
                  <textarea
                    value={customSystem}
                    onChange={e => setCustomSystem(e.target.value)}
                    rows={2}
                    placeholder="Leave empty to use your saved personality..."
                  />
                </label>
              </div>
            )}

            <button
              className="button primary full-button mt-4"
              disabled={!!busy || !message.trim()}
              onClick={handleGeneratePreview}
            >
              {busy === 'playground' ? (
                <>
                  <Loader2 className="spin" size={16} /> Generating test reply…
                </>
              ) : (
                <>
                  <SendHorizontal size={16} /> Generate Private Reply
                </>
              )}
            </button>
            {result('playground')}
          </div>

          {/* Response Display Box */}
          <div className="playground-output settings-card">
            <div className="output-header">
              <div className="section-kicker">
                <Sparkles size={16} /> GENERATED RESPONSE
              </div>
              {reply && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={copyReply}
                  title="Copy reply text"
                >
                  {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </button>
              )}
            </div>

            {reply ? (
              <div className="reply-result-container">
                <div className="response-bubble">
                  <p className="response-text">{reply.reply}</p>
                </div>

                {/* Diagnostics Panel */}
                <div className="diagnostics-grid">
                  <div className="diag-item">
                    <span>Latency</span>
                    <b>{(reply.durationMs / 1000).toFixed(2)}s</b>
                  </div>
                  <div className="diag-item">
                    <span>Words</span>
                    <b>{reply.words}</b>
                  </div>
                  <div className="diag-item">
                    <span>Est. Tokens</span>
                    <b>{reply.estimatedTokens || Math.round(reply.words * 1.33)}</b>
                  </div>
                  <div className="diag-item">
                    <span>Refusal Check</span>
                    {reply.isRefusal ? (
                      <span className="badge-danger">
                        <AlertTriangle size={12} /> Model Refused
                      </span>
                    ) : (
                      <span className="badge-success">
                        <CheckCircle2 size={12} /> Responded Freely
                      </span>
                    )}
                  </div>
                </div>

                <div className="test-disclaimer">
                  <ShieldCheck size={14} />
                  <span>Verified locally · No message was published to your Instagram account</span>
                </div>
              </div>
            ) : (
              <div className="empty-sandbox-state">
                <Sparkles size={38} className="text-muted-foreground opacity-40" />
                <h4>No reply generated yet</h4>
                <p>Pick a prompt or type your own on the left and click Generate.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PROVIDERS & KEYS */}
      {activeTab === 'providers' && (
        <div className="tab-pane-content">
          <div className="settings-card">
            <div className="section-kicker"><Cpu size={17} />MODELS & API KEYS</div>
            <h3>Verify Each Key Individually</h3>
            <p className="body-note">
              Pings the provider directly to verify that the API key is active, has remaining quota, and can generate text.
            </p>

            <div className="provider-test-list">
              {(w.connections.providers || []).map(p => (
                <div className="test-item-card" key={p.id}>
                  <div className="test-item-header">
                    <div>
                      <b>{p.label}</b>
                      <span className="provider-kind-tag">{p.provider.toUpperCase()}</span>
                    </div>
                    <code className="model-code">{p.model}</code>
                  </div>

                  <div className="connection-buttons mt-3">
                    {button(
                      'key:' + p.id,
                      'Ping Key & Auth',
                      async () => {
                        await request('/api/managed-connections', 'POST', {
                          kind: 'provider',
                          action: 'test',
                          id: p.id,
                        });
                        return 'API key is valid and authenticated successfully with ' + p.provider + '.';
                      }
                    )}

                    {button(
                      'gen:' + p.id,
                      'Test Sample Generation',
                      async () => {
                        const r = await request('/api/preview', 'POST', {
                          message: 'Hello! Please confirm you are online.',
                          channel: 'dm',
                          providerId: p.id,
                        });
                        return `Generated in ${(r.durationMs / 1000).toFixed(1)}s: "${r.reply}"`;
                      }
                    )}
                  </div>

                  {result('key:' + p.id)}
                  {result('gen:' + p.id)}
                </div>
              ))}

              {!w.connections.providers?.length && (
                <p className="body-note">No API connections saved yet. Add a key in Connections.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INSTAGRAM ACCOUNTS */}
      {activeTab === 'instagram' && (
        <div className="tab-pane-content">
          <div className="settings-card">
            <div className="section-kicker"><Camera size={17} />INSTAGRAM IDENTITY</div>
            <h3>Verify Account Tokens</h3>
            <p className="body-note">
              Checks Meta Graph API access tokens and ensures permissions for Instagram messaging are active.
            </p>

            <div className="account-test-list">
              {(w.connections.accounts || []).map(a => (
                <div className="test-item-card" key={a.id}>
                  <div className="test-item-header">
                    <div>
                      <b>@{a.username || 'New account'}</b>
                      <span className={'connection-badge ' + (a.verified ? 'connected' : '')}>
                        {a.verified ? 'Token Verified' : 'Needs Verification'}
                      </span>
                    </div>
                    <small className="micro-note">
                      {a.lastEvent
                        ? 'Last event: ' + new Date(a.lastEvent).toLocaleString()
                        : 'No incoming webhook event received yet.'}
                    </small>
                  </div>

                  <div className="mt-3">
                    {button(
                      'account:' + a.id,
                      'Verify Access Token',
                      async () => {
                        await request('/api/managed-connections', 'POST', {
                          kind: 'instagram',
                          action: 'test',
                          id: a.id,
                        });
                        return 'Token is valid. Meta confirmed access for @' + (a.username || 'this account') + '.';
                      }
                    )}
                  </div>

                  {result('account:' + a.id)}
                </div>
              ))}

              {!w.connections.accounts?.length && (
                <p className="body-note">No Instagram accounts connected yet. Add one in Connections.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WEBHOOK RELAY */}
      {activeTab === 'webhook' && (
        <div className="tab-pane-content">
          <div className="settings-card">
            <div className="section-kicker"><Link2 size={17} />WEBHOOK RELAY</div>
            <h3>Check Webhook Bridge & Delivery</h3>
            <p className="body-note">
              Tests the signature verification, receiver forwarding, and simulated message delivery.
            </p>

            <div className="webhook-status-box">
              <div className="delivery-check">
                <span className={'status-dot ' + (w.connections.receiverSeen ? 'green' : 'amber')} />
                <b>{w.connections.receiverSeen ? 'Real Inbound Webhook Confirmed' : 'Waiting for Inbound Event'}</b>
              </div>
              <p className="micro-note">
                {w.connections.lastEvent
                  ? 'Last signed event: ' + new Date(w.connections.lastEvent).toLocaleString()
                  : 'Send a message from an eligible Instagram test account to confirm real delivery.'}
              </p>
            </div>

            <div className="mt-4">
              {button(
                'webhook',
                'Send Signed Relay Test Event',
                async () => {
                  await request('/api/connections', 'POST', { action: 'test-webhook' });
                  return 'Signed test payload was accepted by the webhook handler.';
                }
              )}
            </div>
            {result('webhook')}
          </div>
        </div>
      )}

      {/* TAB 5: AUTOMATION READINESS */}
      {activeTab === 'pipeline' && (
        <div className="tab-pane-content">
          <div className="settings-card">
            <div className="section-kicker"><Clock size={17} />TIMING & PIPELINE</div>
            <h3>Automation Readiness Inspector</h3>
            <p className="body-note">
              Inspects automation windows, typing pause, and queued items without executing sends.
            </p>

            <div className="mt-3">
              {button(
                'readiness',
                'Check Current Automation State',
                async () => {
                  const r = await request('/api/automation-status');
                  return `${r.enabled ? 'Automation Enabled' : 'Automation Paused'} · Window Phase: ${r.automationWindow.phase} · Typing Pause: ${r.replyDelaySeconds}s · Pending Queue: ${r.queue.pending} · Uncertain: ${r.queue.uncertain}`;
                }
              )}
            </div>
            {result('readiness')}

            <div className="mt-4">
              <a className="text-button lab-link" href="?view=automation">
                Open Full Automation Settings <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
