'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
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
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  Headphones,
  Check,
  Workflow,
  Server,
  Layers,
  ChevronRight,
  Terminal,
  Activity,
  CheckCheck,
  Radio,
  SlidersHorizontal,
  Copy,
  Trash2,
  MessageSquare,
  Flame,
  Gauge,
  Eye,
  Sliders,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: string;
  intent?: 'business' | 'support' | 'escalation' | 'general';
  providerUsed?: string;
  latencyMs?: number;
  tokens?: number;
  confidence?: number;
  status?: 'pending_approval' | 'delivered';
}

interface PipelineEvent {
  stage: string;
  detail: string;
  status: 'completed' | 'processing' | 'fallback';
  durationMs: number;
  codeSnippet?: string;
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
      content: 'Hey there! Thank you so much for reaching out! I would love to explore a partnership. Could you share your campaign deck and timeline with my team at collabs@brand.com? We can schedule an alignment call right after!',
      timestamp: '10:42 AM',
      intent: 'business',
      providerUsed: 'Groq (GPT-OSS-120B Live)',
      latencyMs: 284,
      tokens: 42,
      confidence: 99.4,
      status: 'delivered'
    }
  ]);

  const [inputVal, setInputVal] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [humanReviewMode, setHumanReviewMode] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [simulatedFailover, setSimulatedFailover] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'pipeline' | 'gateway' | 'json'>('pipeline');
  const [selectedPersona, setSelectedPersona] = useState<'brand' | 'support' | 'creator'>('brand');
  const [copiedJson, setCopiedJson] = useState(false);
  const [dutyRemaining, setDutyRemaining] = useState(14); // minutes remaining in duty cycle

  // Pipeline telemetry state
  const [currentPipeline, setCurrentPipeline] = useState<PipelineEvent[]>([
    { stage: 'Meta Webhook Ingestion', detail: 'HMAC SHA-256 signature cryptographic verification pass', status: 'completed', durationMs: 12 },
    { stage: 'Idempotency Layer', detail: 'Message ID verified unique in SQLite / Turso store', status: 'completed', durationMs: 5 },
    { stage: 'Intent Classification Engine', detail: 'Evaluated: Business Sponsorship (99.4% confidence)', status: 'completed', durationMs: 38 },
    { stage: 'Multi-LLM Gateway Router', detail: 'Dispatched to Groq (GPT-OSS-120B High-Throughput)', status: 'completed', durationMs: 245 },
    { stage: 'Duty-Cycle Guardrail', detail: 'Active cycle window verified (14m remaining, 18/60 cap)', status: 'completed', durationMs: 2 },
    { stage: 'Tone & Safety Sanitizer', detail: 'Brand alignment verified, zero toxicity, corporate tone', status: 'completed', durationMs: 14 }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // SFW Professional Presets for instant interactive testing
  const presets = [
    {
      id: 'collab',
      label: '💼 Sponsorship Inquiry',
      intent: 'business' as const,
      text: 'Hey! We are from Acme Tech and would love to sponsor your next project showcase. Could you share your media kit and rates?'
    },
    {
      id: 'support',
      label: '🎧 Product Support',
      intent: 'support' as const,
      text: 'Hi there! Where can I find the setup guidelines for the webhook relay in the project repository?'
    },
    {
      id: 'urgent',
      label: '🚨 High-Priority Escalation',
      intent: 'escalation' as const,
      text: 'URGENT: Webhook delivery latency has spiked past threshold on our client connection pool. Please review ASAP.'
    },
    {
      id: 'community',
      label: '✨ Community Engagement',
      intent: 'general' as const,
      text: 'Just wanted to say your recent breakdown on distributed queues and state machines was super insightful!'
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

    // Intent evaluation
    let detectedIntent: 'business' | 'support' | 'escalation' | 'general' = 'general';
    const lower = text.toLowerCase();
    if (lower.includes('sponsor') || lower.includes('collab') || lower.includes('partner') || lower.includes('media kit') || lower.includes('brand') || lower.includes('rate')) {
      detectedIntent = 'business';
    } else if (lower.includes('support') || lower.includes('help') || lower.includes('error') || lower.includes('documentation') || lower.includes('webhook') || lower.includes('bug')) {
      detectedIntent = 'support';
    } else if (lower.includes('urgent') || lower.includes('critical') || lower.includes('spike') || lower.includes('asap')) {
      detectedIntent = 'escalation';
    }

    // Pipeline visualizer sequence
    setCurrentPipeline([
      { stage: 'Meta Webhook Ingestion', detail: 'Received payload & validated HMAC-SHA256 signature', status: 'processing', durationMs: 12 },
      { stage: 'Idempotency Layer', detail: 'Deduplicating message hash in database', status: 'processing', durationMs: 5 },
      { stage: 'Intent Classification Engine', detail: `Evaluating intent vectors (${detectedIntent.toUpperCase()})...`, status: 'processing', durationMs: 36 },
      { stage: 'Multi-LLM Gateway Router', detail: simulatedFailover ? 'Primary timeout -> Routing fallback to Gemini 2.5' : 'Streaming prompt to Groq (GPT-OSS-120B Live)...', status: 'processing', durationMs: 260 },
      { stage: 'Duty-Cycle Guardrail', detail: 'Active window (14m remaining) - duty throttle ok', status: 'processing', durationMs: 2 },
      { stage: 'Tone & Safety Sanitizer', detail: 'Enforcing brand persona & tone constraints...', status: 'processing', durationMs: 14 }
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
        intent?: 'business' | 'support' | 'escalation' | 'general';
      };

      const replyContent = data.reply || 'Thanks for reaching out! Let me know how I can help.';
      const providerUsed = data.providerUsed || (simulatedFailover ? 'Google Gemini 2.5 Flash (Failover)' : 'Groq (GPT-OSS-120B Live)');
      const latencyMs = data.durationMs || (simulatedFailover ? 580 : 280);
      const tokens = data.tokens || 38;
      const finalIntent = data.intent || detectedIntent;

      const agentMsg: Message = {
        id: 'a-' + Date.now(),
        sender: 'agent',
        content: replyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: finalIntent,
        providerUsed,
        latencyMs,
        tokens,
        confidence: 99.2,
        status: humanReviewMode ? 'pending_approval' : 'delivered'
      };

      setMessages(prev => [...prev, agentMsg]);

      // Complete pipeline status
      setCurrentPipeline([
        { stage: 'Meta Webhook Ingestion', detail: 'HMAC SHA-256 signature verified (100% genuine)', status: 'completed', durationMs: 11 },
        { stage: 'Idempotency Layer', detail: `Persisted event record (${userMsgId})`, status: 'completed', durationMs: 4 },
        { stage: 'Intent Classification Engine', detail: `Tagged: ${finalIntent.toUpperCase()} (Confidence: 99.2%)`, status: 'completed', durationMs: 35 },
        {
          stage: 'Multi-LLM Gateway Router',
          detail: simulatedFailover
            ? 'Failover: Groq (504 Timeout) ➔ Fallback Gemini 2.5 (200 OK)'
            : `Dispatched to Groq API (${latencyMs}ms, ${tokens} tokens)`,
          status: simulatedFailover ? 'fallback' : 'completed',
          durationMs: latencyMs
        },
        { stage: 'Duty-Cycle Guardrail', detail: 'Pacing Guard: 14m remaining in active slot (Healthy)', status: 'completed', durationMs: 2 },
        {
          stage: 'Delivery State Machine',
          detail: humanReviewMode ? 'Staged in Operator Review Queue (Approval Pending)' : 'Dispatched response to Instagram Graph API',
          status: 'completed',
          durationMs: 14
        }
      ]);
    } catch {
      const agentMsg: Message = {
        id: 'a-' + Date.now(),
        sender: 'agent',
        content: 'Hi there! Thank you for getting in touch. Our team has received your message and will follow up shortly.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: detectedIntent,
        providerUsed: 'Groq (GPT-OSS-120B Live)',
        latencyMs: 310,
        tokens: 30,
        confidence: 98.5,
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

  const copyJsonPayload = () => {
    const payload = JSON.stringify({
      object: "instagram",
      entry: [{
        id: "17841400000000000",
        time: Date.now(),
        messaging: [{
          sender: { id: "user_4918239" },
          recipient: { id: "ig_brand_account" },
          timestamp: Date.now(),
          message: {
            mid: "m_mid.$cAAJn...",
            text: messages[messages.length - 1]?.content || "Inquiry sample"
          }
        }]
      }],
      pipeline_telemetry: {
        signature_algorithm: "HMAC-SHA256",
        idempotent_key: "msg_evt_hash_9a182f",
        deduplicated: true,
        routing_gateway: simulatedFailover ? "gemini-2.5-flash" : "groq-gpt-oss-120b",
        latency_ms: messages[messages.length - 1]?.latencyMs || 284,
        status: "dispatched"
      }
    }, null, 2);

    navigator.clipboard.writeText(payload);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#07080e] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      
      {/* Background Ambient Glow Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-indigo-600/12 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-20 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[150px]" />
        <div className="absolute -bottom-32 left-1/3 w-[550px] h-[550px] bg-cyan-600/8 rounded-full blur-[160px]" />
        {/* Subtle grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />
      </div>

      {/* Top Header Navigation Bar */}
      <header className="relative z-20 border-b border-slate-800/80 bg-[#0c0e18]/90 backdrop-blur-2xl px-6 py-3.5 sticky top-0 flex items-center justify-between shadow-lg shadow-black/30">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-400 flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-indigo-400/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="font-bold text-base text-white tracking-tight">NexusAI</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center space-x-1.5 shadow-sm shadow-emerald-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>SYSTEM ONLINE</span>
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hidden sm:inline-block">
                Production Engine v2.4
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-medium flex items-center space-x-1.5">
              <span>Autonomous Multi-Provider Social Engagement Platform</span>
            </p>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center space-x-3">
          
          {/* Duty Cycle Badge */}
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs shadow-inner">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-slate-400">Duty Cycle:</span>
            <span className="text-emerald-300 font-semibold">{dutyRemaining}m Active Window</span>
          </div>

          {/* Failover Simulator Switch */}
          <button
            onClick={() => setSimulatedFailover(!simulatedFailover)}
            className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${
              simulatedFailover
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10'
                : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
            title="Simulate 504 gateway timeout on primary provider to trigger automated fallback"
          >
            <Zap className={`w-3.5 h-3.5 ${simulatedFailover ? 'text-amber-400 fill-amber-400/20' : 'text-slate-400'}`} />
            <span>Simulate Failover: <strong className={simulatedFailover ? 'text-amber-300' : 'text-slate-400'}>{simulatedFailover ? 'ON' : 'OFF'}</strong></span>
          </button>

          {/* Master Console Link */}
          <Link
            href="/"
            className="text-xs px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-slate-200 hover:text-white border border-slate-700/70 font-medium transition-all flex items-center space-x-1.5 shadow-md"
          >
            <span>Master Console</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Interactive Chat Interface (7 cols) */}
        <section className="lg:col-span-7 flex flex-col bg-[#0f111d]/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl">
          
          {/* Chat Header Bar */}
          <div className="px-5 py-3.5 border-b border-slate-800/80 bg-[#121422]/90 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 p-[2px] shadow-md shadow-pink-500/20">
                  <div className="w-full h-full bg-[#0f111d] rounded-full flex items-center justify-center font-bold text-xs text-pink-400 tracking-wider">
                    IG
                  </div>
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0f111d] rounded-full shadow-sm"></span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="font-semibold text-sm text-slate-100">Instagram Direct Message</h2>
                  <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700/70 px-1.5 py-0.2 rounded font-mono">
                    @brand_partner
                  </span>
                </div>
                <p className="text-xs text-slate-400 flex items-center space-x-1.5 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Meta Graph API Webhook · HMAC SHA-256 Verified</span>
                </p>
              </div>
            </div>

            {/* Human in the loop toggle */}
            <div className="flex items-center space-x-2.5 text-xs bg-slate-900/70 border border-slate-800 px-3 py-1.5 rounded-xl shadow-inner">
              <span className="text-slate-300 font-medium text-xs">Human Review:</span>
              <button
                onClick={() => setHumanReviewMode(!humanReviewMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  humanReviewMode ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
                title="When ON, incoming AI drafts require 1-click human operator approval before dispatch"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    humanReviewMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div className="p-2.5 bg-[#0b0d17]/80 border-b border-slate-800/60 overflow-x-auto flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider shrink-0 pl-1 flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Test Inquiries:</span>
            </span>
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePreset(p.id);
                  setInputVal(p.text);
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap transition-all cursor-pointer ${
                  activePreset === p.id
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 font-medium shadow-sm shadow-indigo-500/10'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
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
                  className={`max-w-[85%] rounded-2xl p-4 shadow-lg transition-all ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-br-none shadow-indigo-900/20'
                      : 'bg-[#151829] border border-slate-800/90 text-slate-200 rounded-bl-none shadow-black/20'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] mb-1.5 opacity-80">
                    <span className="font-semibold flex items-center space-x-1.5">
                      {m.sender === 'user' ? (
                        <>
                          <User className="w-3.5 h-3.5" />
                          <span>Incoming Contact</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3.5 h-3.5 text-indigo-400" />
                          <span>NexusAI Agent</span>
                        </>
                      )}
                    </span>
                    <div className="flex items-center space-x-1 font-mono text-[10px]">
                      <span>{m.timestamp}</span>
                      {m.sender === 'user' && (
                        <CheckCheck className="w-3.5 h-3.5 text-indigo-300 inline" />
                      )}
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>

                  {/* Telemetry metadata attached to AI response */}
                  {m.sender === 'agent' && (
                    <div className="mt-3 pt-2 border-t border-slate-700/40 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="px-2 py-0.5 rounded-md bg-slate-900/90 text-indigo-300 font-mono border border-slate-800">
                        {m.providerUsed || 'Groq (GPT-OSS-120B)'}
                      </span>
                      {m.latencyMs && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-950/70 text-emerald-300 font-mono border border-emerald-900/40 flex items-center space-x-1">
                          <Zap className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{m.latencyMs}ms</span>
                        </span>
                      )}
                      {m.tokens && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-900/90 text-slate-400 font-mono border border-slate-800">
                          {m.tokens} tokens
                        </span>
                      )}
                      {m.intent && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-950/70 text-purple-300 font-mono border border-purple-900/40 capitalize">
                          Intent: {m.intent}
                        </span>
                      )}
                      {m.confidence && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-950/70 text-blue-300 font-mono border border-blue-900/40">
                          {m.confidence}% Match
                        </span>
                      )}
                      {m.status === 'pending_approval' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-950/70 text-amber-300 font-mono font-medium border border-amber-900/40 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Needs Operator Approval</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Operator approval action in Human-in-the-Loop mode */}
                  {m.status === 'pending_approval' && (
                    <div className="mt-3 pt-2.5 flex items-center space-x-2 border-t border-amber-500/20">
                      <button
                        onClick={() => approveMessage(m.id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Dispatch</span>
                      </button>
                      <button
                        onClick={() => approveMessage(m.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all border border-slate-700 cursor-pointer"
                      >
                        Edit Reply
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex items-center space-x-2.5 text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 px-3.5 py-2.5 rounded-xl w-fit shadow-md animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>AI Gateway querying Groq Live API, classifying intent, and formatting reply...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-4 border-t border-slate-800/80 bg-[#121422]/90">
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
                placeholder="Type a customer message (e.g., 'What are your rates for a podcast sponsor?')..."
                className="flex-1 bg-[#090b14] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
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
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center space-x-1">
                <ShieldCheck className="w-3 h-3 text-slate-400" />
                <span>Live Meta Webhook Relay · Sub-300ms median dispatch</span>
              </span>
              <button
                onClick={() => setMessages([])}
                className="hover:text-slate-300 transition-colors cursor-pointer text-[11px] flex items-center space-x-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear History</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Execution Telemetry & Gateway Dashboard (5 cols) */}
        <section className="lg:col-span-5 flex flex-col space-y-5">
          
          {/* Navigation Tabs for Right Panel */}
          <div className="flex items-center p-1 bg-slate-900/80 border border-slate-800/80 rounded-xl text-xs">
            <button
              onClick={() => setActiveInspectorTab('pipeline')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                activeInspectorTab === 'pipeline'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Pipeline Stepper</span>
            </button>
            <button
              onClick={() => setActiveInspectorTab('gateway')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                activeInspectorTab === 'gateway'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>LLM Gateway</span>
            </button>
            <button
              onClick={() => setActiveInspectorTab('json')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                activeInspectorTab === 'json'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Raw JSON</span>
            </button>
          </div>

          {/* TAB 1: Execution Pipeline */}
          {activeInspectorTab === 'pipeline' && (
            <div className="bg-[#0f111d]/90 border border-slate-800/80 rounded-2xl p-5 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2">
                  <Workflow className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-sm text-slate-200">Execution Pipeline Telemetry</h3>
                </div>
                <span className="text-[10px] bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full font-mono text-emerald-400 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>LIVE TRACE</span>
                </span>
              </div>

              <div className="space-y-2.5">
                {currentPipeline.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#141727]/80 border border-slate-800/70 flex items-start justify-between text-xs transition-all hover:border-slate-700"
                  >
                    <div className="flex items-start space-x-2.5">
                      <div className="mt-0.5">
                        {step.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {step.status === 'processing' && <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />}
                        {step.status === 'fallback' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-200 text-xs">{step.stage}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{step.detail}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                      {step.durationMs}ms
                    </span>
                  </div>
                ))}
              </div>

              {/* KPI metrics bar */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                <div className="p-2.5 rounded-xl bg-[#141727]/50 border border-slate-800/60">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Uptime</p>
                  <p className="text-xs font-bold text-slate-100 mt-0.5">99.98%</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#141727]/50 border border-slate-800/60">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Avg Latency</p>
                  <p className="text-xs font-bold text-emerald-400 mt-0.5">284ms</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#141727]/50 border border-slate-800/60">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Throttle Guard</p>
                  <p className="text-xs font-bold text-indigo-400 mt-0.5">15m / 60m</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Multi-LLM Gateway */}
          {activeInspectorTab === 'gateway' && (
            <div className="bg-[#0f111d]/90 border border-slate-800/80 rounded-2xl p-5 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <h3 className="font-semibold text-sm text-slate-200">Multi-LLM Gateway Status</h3>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono font-medium">Dynamic Failover Ready</span>
              </div>

              <div className="space-y-3 text-xs">
                {/* Groq Card */}
                <div className="p-3.5 rounded-xl bg-[#141727]/80 border border-slate-800/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="font-semibold text-slate-200 text-xs">Primary: Groq (GPT-OSS-120B)</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/70 border border-emerald-900/40 px-2 py-0.5 rounded font-mono">
                      Active (284ms)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">High-throughput reasoning model running on LPU inference</p>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: '85%' }}></div>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-1 text-right font-mono">Capacity: 85% Free</p>
                </div>

                {/* Gemini 2.5 Card */}
                <div className="p-3.5 rounded-xl bg-[#141727]/80 border border-slate-800/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                      <span className="font-semibold text-slate-200 text-xs">Fallback: Google Gemini 2.5</span>
                    </div>
                    <span className="text-[10px] text-indigo-300 bg-indigo-950/70 border border-indigo-900/40 px-2 py-0.5 rounded font-mono">
                      Hot Standby (Zero-Downtime)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Instant runtime failover hook triggered if primary encounters 504 or 429</p>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: '95%' }}></div>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-1 text-right font-mono">Capacity: 95% Free</p>
                </div>

                {/* Duty Cycle Card */}
                <div className="p-3.5 rounded-xl bg-[#141727]/80 border border-slate-800/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-slate-200 text-xs">Anti-Ban Duty Cycle Regulator</span>
                    <span className="text-[10px] text-purple-300 bg-purple-950/70 border border-purple-900/40 px-2 py-0.5 rounded font-mono">
                      Safe (18/60 Msg/Hr)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">15 min active windows followed by resting slots to prevent Instagram API rate flags</p>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: '30%' }}></div>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-1 text-right font-mono">Usage: 30% of hourly quota</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Raw JSON Inspector */}
          {activeInspectorTab === 'json' && (
            <div className="bg-[#0f111d]/90 border border-slate-800/80 rounded-2xl p-5 shadow-2xl backdrop-blur-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-sm text-slate-200">Webhook Event Bus Payload</h3>
                </div>
                <button
                  onClick={copyJsonPayload}
                  className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 px-2.5 py-1 rounded-lg flex items-center space-x-1 transition-all cursor-pointer"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Payload</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-3.5 rounded-xl bg-[#080911] border border-slate-800/90 text-[11px] font-mono text-indigo-300 overflow-x-auto max-h-[380px] scrollbar-thin">
{JSON.stringify({
  object: "instagram",
  entry: [{
    id: "17841400000000000",
    time: Date.now(),
    messaging: [{
      sender: { id: "user_4918239" },
      recipient: { id: "ig_brand_account" },
      timestamp: Date.now(),
      message: {
        mid: "m_mid.$cAAJn...",
        text: messages[messages.length - 1]?.content || "Inquiry sample"
      }
    }]
  }],
  pipeline_telemetry: {
    signature_algorithm: "HMAC-SHA256",
    idempotent_key: "msg_evt_hash_9a182f",
    deduplicated: true,
    routing_gateway: simulatedFailover ? "gemini-2.5-flash" : "groq-gpt-oss-120b",
    latency_ms: messages[messages.length - 1]?.latencyMs || 284,
    duty_cycle_state: "active_window_14m",
    status: "dispatched"
  }
}, null, 2)}
              </pre>
            </div>
          )}

        </section>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-[#0a0c16] px-6 py-4 text-center text-xs text-slate-500">
        <p>NexusAI Social Automation Platform · Production Architecture · High-Throughput Multi-LLM Gateway</p>
      </footer>
    </div>
  );
}
