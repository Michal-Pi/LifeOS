export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Pricing as of 2026-01-29 from:
  // - https://openai.com/api/pricing/
  // - https://www.anthropic.com/pricing
  // - https://ai.google.dev/pricing
  // - https://x.ai/pricing

  // OpenAI Models
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },

  // Anthropic Models
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

  // Google Models
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },

  // xAI Grok Models
  'grok-beta': { input: 5.0, output: 15.0 },
  'grok-2-1212': { input: 2.0, output: 10.0 },
  'grok-4': { input: 6.0, output: 18.0 }, // Frontier model - estimated pricing
  'grok-4-1-fast-reasoning': { input: 8.0, output: 24.0 }, // 2M context + reasoning - estimated
  'grok-code-fast-1': { input: 5.0, output: 15.0 }, // Code-focused - estimated
  'grok-2-image-1212': { input: 0.0, output: 0.05 }, // Image generation (per image)

  default: { input: 5.0, output: 15.0 },
}
