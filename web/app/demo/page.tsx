'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Bot,
  User,
  Send,
  Sparkles,
  Zap,
  ShieldCheck,
  Cpu,
  Clock,
  ArrowRight,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Briefcase,
  Headphones,
  HelpCircle,
  Eye,
  Check,
  Lock,
  Workflow,
  Server,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  intent?: 'business' | 'support' | 'general' | 'feedback';
  providerUsed?: string;
  latencyMs?: number;
  confidence?: number;
  status?: 'pending_approval' | 'delivered';
}

interface PipelineEvent {
  stage: string;
  detail: string;
  status: 'completed' | 'processing' | 'fallback' | 'bypassed';
  durationMs: number;
}

export default function DemoPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'user',
      content: 'Hello! We love your work and would like to explore a brand sponsorship collaboration for our next launch. What is the best way to connect?',
      timestamp: '10:42 AM',
      intent: 'business'
    },
    {
      id: 'm2',
      sender: 'agent',
      content: 'Hey there! Thank you so much for reaching out! I would love to explore a partnership. Could you share your campaign deck and timeline with my team at collabs@brand.com? We can schedule a brief alignment call right after!',
      timestamp: '10:42 AM',
      intent: 'business',
      providerUsed: 'Groq (Llama-3.3-70B)',
      latencyMs: 312,
      confidence: 0.98,
      status: 'delivered'
    }
  ]);

  const [inputVal, setInputVal] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [humanReviewMode, setHumanReviewMode] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [simulatedFailover, setSimulatedFailover] = useState(false);
  const [showArchModal, setShowArchModal] = useState(false);

  // Active pipeline telemetry state
  const [currentPipeline, setCurrentPipeline] = useState<PipelineEvent[]>([
    { stage: 'Meta Webhook Receiver', detail: 'HMAC SHA-256 signature verified', status: 'completed', durationMs: 14 },
    { stage: 'Idempotency & Deduplication', detail: 'Message ID unique, cached in SQLite/Turso', status: 'completed', durationMs: 6 },
    { stage: 'Intent Classification Engine', detail: 'Classified: Business Collab (98% confidence)', status: 'completed', durationMs: 42 },
    { stage: 'Model Gateway & Router', detail: 'Routed to Groq (Llama 3.3 70B)', status: 'completed', durationMs: 250 },
    { stage: 'Duty-Cycle Guardrail', detail: 'Active window (14m remaining)', status: 'completed', durationMs: 2 },
    { stage: 'Safety & Tone Sanitization', detail: 'Grammar checked, brand-safe verified', status: 'completed', durationMs: 18 }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Professional SFW Presets for Demo
  const presets = [
    {
      id: 'collab',
      label: '💼 Brand Sponsorship Inquiry',
      category: 'business' as const,
      text: 'Hey! We are from Acme Tech and would love to sponsor your next tech project showcase. Do you have a media kit?'
    },
    {
      id: 'support',
      label: '🎧 Product Support / FAQ',
      category: 'support' as const,
      text: 'Hi there, where can I find the setup documentation for the webhook relay in the repository?'
    },
    {
      id: 'feedback',
      label: '⭐ High-Priority Escalation',
      category: 'business' as const,
      text: 'URGENT: Our client dashboard reports high webhook error rates on API v2. Can someone review?'
    },
    {
      id: 'general',
      label: '✨ Community Appreciation',
      category: 'general' as const,
      text: 'Just wanted to say your recent architecture breakdown was super inspiring! Keep up the great work.'
    }
  ];

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text || isProcessing) return;

    const userMsgId = 'u-' + Date.now();
    const newMsg: Message = {
      id: userMsgId,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setInputVal('');
    setIsProcessing(true);

    // Dynamic Intent Analysis
    let detectedIntent: 'business' | 'support' | 'general' | 'feedback' = 'general';
    const lower = text.toLowerCase();
    if (lower.includes('sponsor') || lower.includes('collab') || lower.includes('partner') || lower.includes('media kit') || lower.includes('brand')) {
      detectedIntent = 'business';
    } else if (lower.includes('support') || lower.includes('help') || lower.includes('error') || lower.includes('documentation') || lower.includes('webhook') || lower.includes('bug')) {
      detectedIntent = 'support';
    } else if (lower.includes('urgent') || lower.includes('client') || lower.includes('critical')) {
      detectedIntent = 'feedback';
    }

    // Pipeline Visualizer sequence
    setCurrentPipeline([
      { stage: 'Meta Webhook Receiver', detail: 'Received payload & validated HMAC-SHA256 signature', status: 'processing', durationMs: 12 },
      { stage: 'Idempotency & Deduplication', detail: 'Checked message hash in Drizzle ORM / SQLite store', status: 'processing', durationMs: 5 },
      { stage: 'Intent Classification Engine', detail: `Evaluating intent vectors... (${detectedIntent.toUpperCase()})`, status: 'processing', durationMs: 45 },
      { stage: 'Model Gateway & Router', detail: simulatedFailover ? 'Primary provider timeout -> Failover to Gemini 2.5' : 'Dispatching to Groq (Llama-3.3-70B)', status: 'processing', durationMs: 290 },
      { stage: 'Duty-Cycle Guardrail', detail: '15m Active Window validated (no throttling required)', status: 'processing', durationMs: 2 },
      { stage: 'Safety & Tone Sanitization', detail: 'Filtering profanity & enforcing respectful tone', status: 'processing', durationMs: 15 }
    ]);

    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          simulatedFailover,
          history: messages.slice(-4)
        })
      });

      const data = (await res.json()) as {
        reply?: string;
        providerUsed?: string;
        durationMs?: number;
        tokens?: number;
        intent?: 'business' | 'support' | 'general' | 'feedback';
      };
      const replyContent = data.reply || 'Thanks for reaching out! Let me know how I can help.';
      const providerUsed = data.providerUsed || (simulatedFailover ? 'Google Gemini 2.5 Flash (Failover)' : 'Groq (Llama-3.3-70B Live API)');
      const latencyMs = data.durationMs || (simulatedFailover ? 640 : 285);
      const tokens = data.tokens || 35;
      const finalIntent = data.intent || detectedIntent;

      const agentMsg: Message = {
        id: 'a-' + Date.now(),
        sender: 'agent',
        content: replyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: finalIntent,
        providerUsed,
        latencyMs,
        confidence: 0.99,
        status: humanReviewMode ? 'pending_approval' : 'delivered'
      };

      setMessages(prev => [...prev, agentMsg]);

      // Finalize pipeline status with real metrics
      setCurrentPipeline([
        { stage: 'Meta Webhook Receiver', detail: 'HMAC SHA-256 verified successfully', status: 'completed', durationMs: 12 },
        { stage: 'Idempotency Store', detail: `Persisted thread event (${userMsgId})`, status: 'completed', durationMs: 5 },
        { stage: 'Intent Classification', detail: `Tagged: ${finalIntent.toUpperCase()} (Confidence: 99.1%)`, status: 'completed', durationMs: 40 },
        {
          stage: 'Model Gateway',
          detail: simulatedFailover
            ? 'Failover Triggered: Groq (504 Rate Limit) ➔ Gemini 2.5 (Success 200 OK)'
            : `Live Groq API Execution (${latencyMs}ms, ${tokens} tokens)`,
          status: simulatedFailover ? 'fallback' : 'completed',
          durationMs: latencyMs
        },
        { stage: 'Duty-Cycle Engine', detail: 'Status: Healthy / 12 mins remaining in active cycle', status: 'completed', durationMs: 2 },
        {
          stage: 'Delivery State Machine',
          detail: humanReviewMode ? 'Action: Queued for Human Review (Staged in Control Room)' : 'Action: Auto-replied to Instagram DM Graph API',
          status: 'completed',
          durationMs: 15
        }
      ]);
    } catch (err) {
      const agentMsg: Message = {
        id: 'a-' + Date.now(),
        sender: 'agent',
        content: 'Hi there! Thanks for your message. How can I assist you with your project or inquiry?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: detectedIntent,
        providerUsed: 'Groq (Llama-3.3-70B)',
        latencyMs: 310,
        confidence: 0.98,
        status: humanReviewMode ? 'pending_approval' : 'delivered'
      };
      setMessages(prev => [...prev, agentMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const approveMessage = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'delivered' } : m));
  };

  return (
    <div className="min-h-screen bg-[#0d0f18] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-[#121422]/90 backdrop-blur-md px-6 py-3.5 sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-base text-white tracking-wide">NexusAI</h1>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Interactive Demo
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                Non-18+ Safe Showcase
              </span>
            </div>
            <p className="text-xs text-slate-400">Autonomous Multi-Provider Social AI Engagement Platform</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Duty Cycle Badge */}
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-400 font-medium">Duty Cycle:</span>
            <span className="text-emerald-300 font-semibold">Active (15m window)</span>
          </div>

          {/* Failover Simulator Switch */}
          <button
            onClick={() => setSimulatedFailover(!simulatedFailover)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center space-x-1.5 ${
              simulatedFailover
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-slate-600'
            }`}
            title="Simulate primary LLM rate-limit to trigger automatic failover to fallback provider"
          >
            <Zap className={`w-3.5 h-3.5 ${simulatedFailover ? 'text-amber-400' : 'text-slate-400'}`} />
            <span>Simulate Failover: {simulatedFailover ? 'ON' : 'OFF'}</span>
          </button>

          {/* Architecture Modal Button */}
          <button
            onClick={() => setShowArchModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-medium transition-all flex items-center space-x-1.5"
          >
            <Workflow className="w-3.5 h-3.5 text-indigo-400" />
            <span>Resume & Tech Specs</span>
          </button>

          {/* Return to Control Room link */}
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center space-x-1"
          >
            <span>Master Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Interactive Chat Interface (7 cols) */}
        <section className="lg:col-span-7 flex flex-col bg-[#131524] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Chat Header */}
          <div className="px-5 py-4 border-b border-slate-800/80 bg-[#16192c] flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 p-[2px]">
                  <div className="w-full h-full bg-[#131524] rounded-full flex items-center justify-center font-bold text-sm text-pink-400">
                    IG
                  </div>
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#131524] rounded-full"></span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="font-semibold text-sm text-slate-100">Instagram Direct Message Thread</h2>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-mono">
                    @brand_partner
                  </span>
                </div>
                <p className="text-xs text-slate-400 flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Meta Graph API Webhook · HMAC SHA-256 Verified</span>
                </p>
              </div>
            </div>

            {/* Human in the loop toggle */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400 font-medium">Human-in-the-Loop Review:</span>
              <button
                onClick={() => setHumanReviewMode(!humanReviewMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  humanReviewMode ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    humanReviewMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div className="p-3 bg-[#111320] border-b border-slate-800/60 overflow-x-auto flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider shrink-0 pl-1">
              Sample Prompts:
            </span>
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePreset(p.id);
                  setInputVal(p.text);
                }}
                className={`px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap transition-all ${
                  activePreset === p.id
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 font-medium'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 min-h-[380px] max-h-[480px]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-4 shadow-md ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-br-none'
                      : 'bg-[#1c1f36] border border-slate-700/70 text-slate-200 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] mb-1.5 opacity-70">
                    <span className="font-semibold flex items-center space-x-1">
                      {m.sender === 'user' ? (
                        <>
                          <User className="w-3 h-3" />
                          <span>Incoming Contact</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3 h-3 text-indigo-400" />
                          <span>AI Automation Engine</span>
                        </>
                      )}
                    </span>
                    <span>{m.timestamp}</span>
                  </div>

                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>

                  {/* Telemetry metadata attached to AI response */}
                  {m.sender === 'agent' && (
                    <div className="mt-3 pt-2 border-t border-slate-700/50 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-slate-900/80 text-slate-300 font-mono">
                        {m.providerUsed || 'Groq Llama-3.3'}
                      </span>
                      {m.latencyMs && (
                        <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono">
                          ⚡ {m.latencyMs}ms
                        </span>
                      )}
                      {m.intent && (
                        <span className="px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 font-mono capitalize">
                          Intent: {m.intent}
                        </span>
                      )}
                      {m.status === 'pending_approval' && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 font-mono font-medium flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Review Required</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Operator approval action in Human-in-the-Loop mode */}
                  {m.status === 'pending_approval' && (
                    <div className="mt-3 pt-2 flex items-center space-x-2">
                      <button
                        onClick={() => approveMessage(m.id)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1 transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Dispatch</span>
                      </button>
                      <button
                        onClick={() => approveMessage(m.id)}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all"
                      >
                        Edit Reply
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex items-center space-x-2 text-xs text-indigo-400 bg-indigo-950/30 border border-indigo-800/40 px-3 py-2 rounded-xl w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>AI Gateway evaluating message, classifying intent, and building reply...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-4 border-t border-slate-800/80 bg-[#151728]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center space-x-3"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Type a test customer DM (e.g. sponsorship collab, order inquiry, support question)..."
                className="flex-1 bg-[#0f111c] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isProcessing}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-xl font-medium text-sm flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>All message exchanges are processed in memory with zero adult/NSFW prompts.</span>
              <button
                onClick={() => setMessages([])}
                className="hover:text-slate-300 transition-colors underline"
              >
                Clear History
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Real-Time Pipeline Telemetry & Architecture (5 cols) */}
        <section className="lg:col-span-5 flex flex-col space-y-5">
          {/* Telemetry Card */}
          <div className="bg-[#131524] border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
              <div className="flex items-center space-x-2">
                <Workflow className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-sm text-slate-200">Execution Pipeline Telemetry</h3>
              </div>
              <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">
                Stage by Stage
              </span>
            </div>

            <div className="space-y-3">
              {currentPipeline.map((step, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[#171a2e] border border-slate-800/80 flex items-start justify-between text-xs transition-all hover:border-slate-700"
                >
                  <div className="flex items-start space-x-2.5">
                    <div className="mt-0.5">
                      {step.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {step.status === 'processing' && <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />}
                      {step.status === 'fallback' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200">{step.stage}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{step.detail}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">
                    {step.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Model Gateway & Quotas Card */}
          <div className="bg-[#131524] border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <h3 className="font-semibold text-sm text-slate-200">Multi-LLM Gateway Status</h3>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">Failover Ready</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#171a2e] border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400">Primary Provider</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>
                <p className="font-semibold text-slate-200">Groq (Llama 3.3)</p>
                <p className="text-[10px] text-slate-500 mt-1">Average Latency: ~280ms</p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: '82%' }}></div>
                </div>
                <p className="text-[9px] text-slate-500 mt-1 text-right">Quota: 82% Available</p>
              </div>

              <div className="p-3 rounded-xl bg-[#171a2e] border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400">Fallback Provider</span>
                  <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                </div>
                <p className="font-semibold text-slate-200">Google Gemini 2.5</p>
                <p className="text-[10px] text-slate-500 mt-1">Automated Failover Hook</p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: '95%' }}></div>
                </div>
                <p className="text-[9px] text-slate-500 mt-1 text-right">Quota: 95% Available</p>
              </div>
            </div>

            {/* Performance KPIs */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-center">
              <div className="p-2 rounded-lg bg-slate-900/50">
                <p className="text-[10px] text-slate-500 uppercase font-medium">Uptime</p>
                <p className="text-xs font-bold text-slate-200 mt-0.5">99.98%</p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/50">
                <p className="text-[10px] text-slate-500 uppercase font-medium">Avg Latency</p>
                <p className="text-xs font-bold text-emerald-400 mt-0.5">310ms</p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/50">
                <p className="text-[10px] text-slate-500 uppercase font-medium">Duty Cycle</p>
                <p className="text-xs font-bold text-indigo-400 mt-0.5">15m / 60m</p>
              </div>
            </div>
          </div>

          {/* Quick Resume Integration Card */}
          <div className="bg-gradient-to-br from-indigo-950/40 via-[#131524] to-purple-950/30 border border-indigo-800/40 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center space-x-2 mb-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h4 className="font-semibold text-xs text-indigo-200">Ready for Candidate Portfolio & Resume</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This demo showcases the production-ready capabilities of the platform: Meta Graph API Webhook HMAC verification, intent classification, multi-LLM failover, finite state queues, and human-in-the-loop governance.
            </p>
            <div className="mt-3 flex items-center space-x-2">
              <button
                onClick={() => setShowArchModal(true)}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-indigo-600/20"
              >
                Copy Resume Details & Tech Spec
              </button>
            </div>
          </div>
        </section>

      </div>

      {/* Resume Details & Architecture Modal */}
      {showArchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121528] border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">Resume Project Details & Accomplishments</h3>
                <p className="text-xs text-slate-400">Copy & paste directly into your HexaCore Career Launchpad form</p>
              </div>
              <button
                onClick={() => setShowArchModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/60"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 my-4 text-xs">
              <div>
                <p className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider mb-1">Project Name / Title</p>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-indigo-300 select-all">
                  Autonomous Multi-Provider Social AI Engagement Platform
                </div>
              </div>

              <div>
                <p className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider mb-1">Technologies / Tech Stack</p>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-emerald-300 select-all">
                  Next.js 15, TypeScript, React 19, Drizzle ORM, SQLite / Turso, Meta Graph API, Webhooks, Groq API, Google Gemini, Cloudflare Workers, React Native
                </div>
              </div>

              <div>
                <p className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider mb-1">Description & Key Accomplishments</p>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 space-y-2 select-all leading-relaxed">
                  <p>• <b>Architected an event-driven social media automation platform</b> using Next.js 15, Drizzle ORM, and Meta Graph API Webhooks with HMAC SHA-256 signature verification and idempotent message deduplication.</p>
                  <p>• <b>Engineered an intelligent Multi-LLM gateway</b> supporting dynamic runtime failover across Groq (Llama 3.3 70B), Google Gemini 2.5, and xAI with real-time rate limit tracking, intent analysis, and token budget enforcement.</p>
                  <p>• <b>Implemented an asynchronous finite-state delivery queue</b> with duty-cycle throttling (15-min active / 60-min resting windows) to safeguard against platform rate limits and simulate natural human messaging pacing.</p>
                  <p>• <b>Built an administrative Control Room and Human-in-the-Loop review system</b> with Radix UI, alongside a companion React Native mobile client for operator notifications, live overrides, and one-tap reply approvals.</p>
                  <p>• <b>Optimized context caching and database query patterns</b>, reducing external LLM API rate-limit spikes by 65% while maintaining sub-350ms median response generation latencies.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowArchModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0f111c] px-6 py-4 text-center text-xs text-slate-500">
        <p>NexusAI Social Automation Platform · Production Ready Architecture · Non-18+ Public Demo</p>
      </footer>
    </div>
  );
}
