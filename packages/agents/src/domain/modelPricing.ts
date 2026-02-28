export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Pricing as of 2026-02-09 ($ per million tokens) from:
  // - https://openai.com/api/pricing/
  // - https://platform.claude.com/docs/en/docs/about-claude/models/overview
  // - https://ai.google.dev/gemini-api/docs/pricing
  // - https://docs.x.ai/docs/models

  // ── OpenAI — Current ──────────────────────────────────────────────
  'gpt-5.2-pro': { input: 21.0, output: 168.0 }, // Max
  o1: { input: 15.0, output: 60.0 }, // Thinking
  'gpt-5.2': { input: 1.75, output: 14.0 }, // Normal
  'gpt-5-mini': { input: 0.25, output: 2.0 }, // Fast

  // OpenAI — Previous Generation (kept for existing run cost lookups)
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  o3: { input: 2.0, output: 8.0 },
  'o4-mini': { input: 1.1, output: 4.4 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },

  // ── Anthropic — Current ───────────────────────────────────────────
  'claude-opus-4-6': { input: 5.0, output: 25.0 }, // Thinking
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 }, // Normal (alias)
  'claude-haiku-4-5': { input: 1.0, output: 5.0 }, // Fast (alias)
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 }, // Normal (dated)
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 }, // Fast (dated)

  // Anthropic — Legacy (kept for existing run cost lookups)
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

  // ── Google Gemini — Current ───────────────────────────────────────
  'gemini-3-pro': { input: 2.0, output: 12.0 }, // Thinking
  'gemini-2.5-pro': { input: 1.25, output: 10.0 }, // Normal
  'gemini-3-flash': { input: 0.5, output: 3.0 }, // Fast

  // Gemini — Previous Generation (kept for existing run cost lookups)
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },

  // ── xAI Grok — Current ───────────────────────────────────────────
  'grok-4': { input: 3.0, output: 15.0 }, // Thinking
  'grok-4-1-fast-non-reasoning': { input: 0.2, output: 0.5 }, // Normal
  'grok-3-mini': { input: 0.1, output: 0.3 }, // Fast

  // Grok — Previous (kept for existing run cost lookups)
  'grok-4-1-fast-reasoning': { input: 0.2, output: 0.5 },
  'grok-3': { input: 3.0, output: 15.0 },
  'grok-code-fast-1': { input: 0.2, output: 1.5 },

  default: { input: 5.0, output: 15.0 },
}
