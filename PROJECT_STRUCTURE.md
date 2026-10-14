# Project Structure & Directory Guide

This document provides a comprehensive map of the **LLM-Uncencored-Nina-Automation** repository, detailing the architecture of the web control center, backend automation engines, mobile applications, and database layer.

---

## 1. Top-Level Workspace Tree

```text
LLM-Uncencored-Nina-Automation/
├── START_HERE.md                           # Quickstart guide & environment overview
├── PROJECT_STRUCTURE.md                    # (This file) Complete repository map & directory guide
├── CHATBOT_CONFIGURATIONS.md               # Dedicated architecture guide for chatbot persona, prompts & routing
│
├── web/                                    # Fullstack Control Room, AI Engine & Webhook Relay (Next.js 15)
│   ├── app/                                # Next.js App Router (UI views, API routes, layout)
│   ├── lib/                                # Core Engine, AI logic, prompt builders, queue processor
│   ├── db/                                 # Drizzle ORM schemas & SQLite/Turso database adapters
│   ├── components/                         # UI components & Radix primitives
│   ├── scripts/                            # Automation, CI/CD, and workspace management scripts
│   ├── tests/                              # Unit & integration test suites
│   ├── public/                             # Static assets
│   └── *.mjs                               # Standalone maintenance, inspection, and verification scripts
│
├── android-app/                            # React Native Bare Android Mobile Application
│   ├── src/                                # Mobile application state models & utilities
│   ├── android/                            # Native Android project (Gradle, manifest, keystore)
│   └── App.tsx                             # Mobile dashboard & background sync interface
│
└── expo-app/                               # React Native Expo Companion Client
    ├── App.tsx                             # Expo control client & approval interface
    └── app.json                            # Expo manifest configuration
```

---

## 2. Web Engine & Dashboard (`web/`)

The `web/` directory houses the primary automation engine, Cloudflare Worker relay, Next.js Control Room interface, and LLM orchestration pipeline.

```text
web/
├── app/
│   ├── api/                                # Backend REST API endpoints
│   │   ├── auth/                           # Authentication endpoints
│   │   ├── automation-status/              # Automation window & duty-cycle status
│   │   ├── connections/                    # Instagram & primary provider configuration
│   │   ├── export/                         # Workspace state export (.json)
│   │   ├── limits/                         # Quota headers & rate limit monitoring
│   │   ├── managed-connections/            # Multi-account & multi-provider routing API
│   │   ├── mobile/                         # Mobile device pairing & sync
│   │   ├── mobile-access/                  # Mobile auth verification & token exchange
│   │   ├── preview/                        # Live test sandbox reply generator
│   │   ├── process/                        # Manual/scheduled queue processor trigger
│   │   ├── threads/                        # Thread actions (approve, draft, takeover, delete)
│   │   ├── webhook/                        # Meta Instagram Webhook receiver & signature verifier
│   │   └── workspace/                      # Workspace state load & save API
│   │
│   ├── control-room.tsx                    # Master Control Room (Inbox, Personality, Automation, Connections)
│   ├── managed-connections.tsx             # Multi-provider failover & multi-account UI manager
│   ├── test-lab.tsx                        # Provider playground & diagnostic testing suite
│   ├── limit-monitor.tsx                   # Live API quota tracker (calls, tokens, remaining limits)
│   ├── security-panel.tsx                  # Android device pairing & one-time security codes
│   ├── workspace-pulse.tsx                 # Status indicator for active/break automation cycle
│   ├── layout.tsx & page.tsx               # Root Next.js layout and shell
│   └── globals.css                         # Custom theme, dark/light styling, and UI system
│
├── lib/                                    # AI Orchestration, Prompt Logic & Automation
│   ├── model.ts                            # Global TypeScript types, Nina persona defaults & settings
│   ├── reply-style.ts                      # System prompt generator, Hinglish female grammar rules
│   ├── text-analyzer.ts                    # Keyword & intent analyzer (Spicy / Flirty / Normal)
│   ├── training-corpus.ts                  # Nina Kurain official feminine Hinglish training dataset
│   ├── provider-config.ts                  # Provider base URLs (Groq, Gemini, xAI, OpenRouter, AI Horde)
│   ├── provider-limits.ts                  # API rate-limiting, error retries & backoff logic
│   ├── limit-metadata.ts                   # Parsing provider response headers for rate limits
│   ├── automation-window.ts                # Duty cycle state machine (15m active / 60m break)
│   ├── queue.ts                            # Async job queue & multi-step delivery state machine
│   ├── server.ts                           # Server state manager & end-to-end LLM reply generator
│   ├── turso.ts                            # LibSQL / Turso database adapter
│   └── webhook-signature.ts                # Meta HMAC SHA-256 signature verification
│
├── db/                                     # Database Persistence Layer
│   ├── schema.ts                           # Drizzle ORM table schemas (workspace_state, threads, jobs, usage)
│   └── index.ts                            # Database connection initialization
│
├── components/                             # Reusable Frontend Components
│   ├── connector-error.tsx                 # Connection error diagnostics card
│   └── ui/                                 # Radix UI primitives (tabs, switch, slider, dialog, etc.)
│
├── scripts/                                # Maintenance & Setup Scripts
│   ├── update-settings-tone.mjs            # Script to programmatically update workspace tone
│   ├── run-framework.mjs                   # Framework bootstrapper
│   └── build-verified.sh                   # Verified production build script
│
├── Diagnostic & Verification Scripts:
│   ├── check-blocked-jobs.mjs              # Inspect queue for stuck or deadlocked jobs
│   ├── check-job-ages.mjs                  # Inspect job timestamps and processing lag
│   ├── check-providers.mjs                 # Verify health of configured LLM providers
│   ├── inspect-jobs.mjs                    # Query raw database job entries
│   ├── inspect-queue-state.mjs             # Diagnostic dump of queue states
│   ├── inspect-threads.mjs                 # Inspect conversation threads in the database
│   ├── reset-stuck-jobs.mjs                # Reset pending jobs trapped in processing state
│   ├── set-groq-primary.mjs                # Switch primary provider to Groq
│   ├── test-live-process.mjs               # Trigger a live queue processing run
│   ├── test-provider-call.mjs              # Direct prompt test to configured AI provider
│   └── test-provider-keys.mjs              # Test and validate all stored provider API keys
│
├── Configuration Files:
│   ├── drizzle.config.ts                   # Drizzle ORM configuration
│   ├── eslint.config.mjs                   # ESLint rules
│   ├── next.config.ts                      # Next.js configuration
│   ├── package.json                        # Dependencies and scripts
│   ├── tsconfig.json                       # TypeScript compiler settings
│   ├── worker.js                           # Cloudflare Worker entry point
│   └── wrangler.json                       # Cloudflare Workers configuration
```

---

## 3. Android Mobile Application (`android-app/`)

A bare React Native Android application for background message sync, notifications, and mobile approvals.

```text
android-app/
├── App.tsx                                 # Main mobile application component (inbox & queue approvals)
├── index.js                                # Application entry point
├── app.json                                # React Native app metadata
├── package.json                            # Mobile dependencies
│
├── src/
│   └── model.ts                            # Mobile synchronization types
│
└── android/                                # Native Android Project
    ├── app/
    │   ├── build.gradle                    # Android build script & signing config
    │   └── src/main/AndroidManifest.xml    # Android permissions & services
    ├── build.gradle                        # Root Gradle build script
    ├── gradle.properties                   # Gradle properties & memory options
    └── gradlew / gradlew.bat               # Gradle wrapper executable
```

---

## 4. Expo Mobile Application (`expo-app/`)

A companion React Native client built on the Expo managed workflow.

```text
expo-app/
├── App.tsx                                 # Expo mobile interface
├── app.json                                # Expo configuration & manifest
├── eas.json                                # Expo Application Services build configuration
└── package.json                            # Expo dependencies
```
