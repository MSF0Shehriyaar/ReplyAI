# Chatbot & AI Configuration Architecture

This document provides a detailed breakdown of all configuration layers controlling Nina's persona, linguistic rules, smart intent routing, LLM provider failover, and automation constraints.

---

## 1. Chatbot Configuration Map

```text
CHATBOT CONFIGURATION SYSTEM
│
├── 🧠 1. PERSONA & IDENTITY
│   ├── [model.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/model.ts#L4-L6) ── Settings.profile
│   │   ├── Name: "Nina Kurain"
│   │   ├── DOB / Age: 2001-07-08 (auto-calculated: 24–25 yrs)
│   │   ├── City & Country: Mumbai, India
│   │   ├── Profession: Content Creator & Influencer
│   │   ├── Content Style: 100% authentic, aesthetic photoshoots, no AI used
│   │   ├── Photographer: Close best friend shoots all photos & videos
│   │   ├── Audio/Call Policy: Strictly text only (declines phone calls, video calls & voice notes)
│   │   ├── Vibe: Chill, confident, little sass, sweet, short replies
│   │   └── denyAi: true (Strictly denies being an AI; asserts real human identity)
│   │
│   └── [control-room.tsx](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/app/control-room.tsx#L65) ── Personality UI
│       └── Live editing controls for character bio, photoshoot locations, and facts.
│
├── 🗣️ 2. GRAMMAR LAWS & HINGLISH DIALECT
│   ├── [reply-style.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts#L47-L86) ── enforceRespectfulFemaleGrammar()
│   │   ├── Feminine First-Person Verbs (Strictly enforced):
│   │   │   └── "main karti hu", "bol rahi hu", "karungi", "dekhungi", "aungi", "thak gayi"
│   │   ├── Polite Second-Person Pronouns (Zero "Tu"):
│   │   │   └── "tu/tera/teri/tujhe" ──► automatically replaced with "tum/tumhara/tumhari/tumhe/aap"
│   │   └── Slang & Vocabulary Sanitization:
│   │       ├── "bhai/bro" ──► replaced with "yaar"
│   │       ├── "bol be" ──► replaced with "batao na"
│   │       └── Banned: Tapori / Chapri terms ("apun", "beedu", "chikna", "item")
│   │
│   └── [training-corpus.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/training-corpus.ts#L21-L60) ── FEMININE_RULES & TRAINING_PAIRS
│       ├── Sweet feminine Hinglish expressions ("aww", "haye", "arre baba", "suno", "jaan", "sukoon")
│       └── Categorized training dialogue pairs (Greetings, Casual, Compliments, Flirty, Boundaries)
│
├── 🔀 3. SMART INTENT ROUTING (Uncensored vs. Standard)
│   ├── [text-analyzer.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/text-analyzer.ts#L12-L60) ── analyzeIncomingText()
│   │   ├── Intent Categories: 'sexy' | 'flirty' | 'normal'
│   │   ├── DEFAULT_SPICY_KEYWORDS: English + Hinglish adult, erotic & sensual keywords
│   │   ├── DEFAULT_FLIRTY_KEYWORDS: Romantic, compliment & teasing triggers
│   │   └── customSpicyWords: User-defined custom keyword list
│   │
│   └── [server.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/server.ts) ── Dynamic Provider Switching
│       ├── If 'sexy' or 'flirty' detected ──► Route to spicyProviderId (AI Horde Uncensored / Custom)
│       └── If 'normal' detected ─────────────► Route to normalProviderId / primaryProviderId (Groq / Gemini)
│
├── 🌐 4. MODEL PROVIDERS & ENDPOINTS
│   ├── [provider-config.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/provider-config.ts#L2-L12) ── providerConfig
│   │   ├── groq:       https://api.groq.com/openai/v1 (e.g. openai/gpt-oss-120b)
│   │   ├── gemini:     https://generativelanguage.googleapis.com/v1beta/openai
│   │   ├── xai:        https://api.x.ai/v1 (Grok)
│   │   ├── openrouter: https://openrouter.ai/api/v1
│   │   ├── aihorde:    https://aihorde.net/api/v2 (Uncensored models)
│   │   └── cloudflare: Cloudflare Workers AI
│   │
│   └── [managed-connections.tsx](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/app/managed-connections.tsx)
│       └── Multi-key failover order, health checks, cooldown handling, and account bindings.
│
├── 📏 5. REPLY LENGTH & STYLING CONTROLS
│   ├── [reply-style.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts#L3-L8) ── replyLengthInstruction()
│   │   ├── Level 1: 2–8 words max (Punchy phrase)
│   │   ├── Level 2: 1–2 short sentences
│   │   ├── Level 3: Up to 3 short sentences
│   │   └── Level 4: Adaptive (short for greetings; substantive when sender asks questions)
│   ├── maxWords Slider: Enforces strict word count cap (2 to 50 words)
│   ├── emoji: 0% to 100% frequency ([varyEmoji()](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts#L17-L23))
│   └── playfulness: 0% (Understated) to 100% (Cheeky/teasing)
│
└── ⏱️ 6. AUTOMATION TIMING & SAFETY
    ├── [automation-window.ts](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/automation-window.ts) ── Duty Cycle
    │   ├── cycleActiveMinutes: 15 min active
    │   └── cycleBreakMinutes: 60 min resting (simulates natural human breaks)
    ├── replyDelaySeconds: 30s debounce (waits for consecutive DMs to finish before generating 1 reply)
    └── approval: Toggle between Draft Review Queue and Instant Auto-Sending
```

---

## 2. Configuration Details & Code Locations

### 1. Persona & Identity
- **File**: [`web/lib/model.ts`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/model.ts#L4-L6)
- **Key Object**: `defaults.profile`
- **Fields**:
  - `name`: Nina's full name (`"Nina Kurain"`).
  - `dob`: Date of birth (`"2001-07-08"`). Age is dynamically calculated via [`profileAge()`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts#L24-L27).
  - `city` / `country`: `"Mumbai"`, `"India"`.
  - `profession`: `"Content Creator & Influencer"`.
  - `contentStyle`: Aesthetic, selective content, 100% real photography.
  - `callPreference`: Strictly text only (no normal calls, video calls, or voice notes).
  - `denyAi`: If true, prompt strictly forbids admitting to being an AI or bot under any circumstances.

### 2. Prompt Builder & Grammar Rules
- **File**: [`web/lib/reply-style.ts`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts)
- **Functions**:
  - [`buildSystemPrompt()`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts#L88): Compiles persona, bio, tone, language, and guidelines into the final system prompt.
  - [`enforceRespectfulFemaleGrammar()`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts#L56): Post-processes every model reply to force feminine verb endings and replace rude pronouns.
  - [`varyEmoji()`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/reply-style.ts#L17): Dynamically rotates emojis to prevent repetitive responses.

### 3. Smart Intent Routing (Uncensored vs. Standard)
- **File**: [`web/lib/text-analyzer.ts`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/text-analyzer.ts)
- **Functions & Constants**:
  - `DEFAULT_SPICY_KEYWORDS`: Adult & erotic words in English and Romanized Hindi.
  - `DEFAULT_FLIRTY_KEYWORDS`: Compliment and flirty triggers.
  - [`analyzeIncomingText()`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/text-analyzer.ts#L42): Evaluates incoming messages, computes intent scores, and returns recommended routing.
- **Workflow**:
  - When a message contains adult/erotic triggers, the backend routes generation to `spicyProviderId` (e.g. AI Horde Uncensored).
  - Standard conversation routes to `normalProviderId` (e.g. Groq GPT-OSS or Gemini).

### 4. Training Corpus & Few-Shot Examples
- **File**: [`web/lib/training-corpus.ts`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/training-corpus.ts)
- **Contents**:
  - `FEMININE_RULES`: Rules and laws for Hinglish female texting.
  - `TRAINING_PAIRS`: Curated sample dialogues organized into categories:
    - Greetings & Introductions
    - Casual Conversation
    - Compliments & Photoshoot Inquiries
    - Flirty Banter
    - Boundary Setting (politely declining phone calls and meetups)

### 5. Providers & LLM APIs
- **File**: [`web/lib/provider-config.ts`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/provider-config.ts)
- **Config**:
  - Base endpoints for Groq, Gemini, xAI, OpenRouter, AI Horde, and Cloudflare.
  - [`completionBody()`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/lib/provider-config.ts#L10): Normalizes OpenAI-compatible completion bodies (handles max tokens, temperatures, reasoning effort).

---

## 3. Web Dashboard Controls Summary

| UI Section | Source File | Description |
| :--- | :--- | :--- |
| **Personality Tab** | [`control-room.tsx:L65`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/app/control-room.tsx#L65) | Edit Nina's name, age, city, photoshoot style, tone, max words, and voice examples. |
| **Automation Tab** | [`control-room.tsx:L66`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/app/control-room.tsx#L66) | Smart routing toggle, custom trigger words, active/break duty cycles, and message debounce window. |
| **Connections Tab** | [`managed-connections.tsx`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/app/managed-connections.tsx) | Connect API keys, set provider priority order, and assign models to Instagram accounts. |
| **Test Lab** | [`test-lab.tsx`](file:///c:/Users/sarha/OneDrive/Desktop/LLM-Uncencored-Nina-Automation/web/app/test-lab.tsx) | Sandbox testing for individual provider keys, response latencies, and output verification. |
