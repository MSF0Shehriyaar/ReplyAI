// ─── WhatsApp Automation — Provider Configuration ───────────────────────
// Uses the SAME API keys as the Instagram automation.
// Provider config is shared; keys are stored in the same Turso database.

import type { ProviderKind } from './model';

export const providerConfig: Record<ProviderKind, { name: string; base: string }> = {
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1' },
  gemini: { name: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  xai: { name: 'Grok · xAI', base: 'https://api.x.ai/v1' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1' },
  aihorde: { name: 'AI Horde (Uncensored)', base: 'https://aihorde.net/api/v2' },
  cloudflare: { name: 'Cloudflare Workers AI', base: 'https://api.cloudflare.com/client/v4/accounts' },
};

export function completionBody(
  provider: ProviderKind,
  model: string,
  messages: { role: string; content: string }[],
  temperature?: number
) {
  return {
    model: provider === 'gemini' ? model.replace(/^models\//, '') : model,
    messages,
    temperature: temperature ?? 0.6,
    stop: ['\nUser:', '\n[User', '<|eot_id|>', '<|end_of_text|>'],
    ...(provider === 'groq'
      ? { max_completion_tokens: 800, ...(model.startsWith('openai/') ? { reasoning_effort: 'low' } : {}) }
      : { max_tokens: 800 }),
    ...(provider === 'gemini' ? { reasoning_effort: 'low' } : {}),
  };
}
