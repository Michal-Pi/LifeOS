import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'

import type { ProviderKeys } from './providerService.js'

export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

// Search & Research tool API keys
export const SERPER_API_KEY = defineSecret('SERPER_API_KEY')
export const FIRECRAWL_API_KEY = defineSecret('FIRECRAWL_API_KEY')
export const EXA_API_KEY = defineSecret('EXA_API_KEY')

export interface SearchToolKeys {
  serper?: string
  firecrawl?: string
  exa?: string
  jina?: string
}

export async function loadSearchToolKeys(userId: string): Promise<SearchToolKeys> {
  const db = getFirestore()
  const docRef = db.doc(`users/${userId}/settings/searchToolKeys`)
  const snapshot = await docRef.get()
  const userKeys = snapshot.exists
    ? (snapshot.data() as {
        serperKey?: string
        firecrawlKey?: string
        exaKey?: string
        jinaKey?: string
      })
    : {}

  return {
    serper: userKeys.serperKey || SERPER_API_KEY.value() || process.env.SERPER_API_KEY || undefined,
    firecrawl:
      userKeys.firecrawlKey ||
      FIRECRAWL_API_KEY.value() ||
      process.env.FIRECRAWL_API_KEY ||
      undefined,
    exa: userKeys.exaKey || EXA_API_KEY.value() || process.env.EXA_API_KEY || undefined,
    jina: userKeys.jinaKey || process.env.JINA_API_KEY || undefined,
  }
}

export async function loadProviderKeys(userId: string): Promise<ProviderKeys> {
  const db = getFirestore()
  const docRef = db.doc(`users/${userId}/settings/aiProviderKeys`)
  const snapshot = await docRef.get()
  const userKeys = snapshot.exists
    ? (snapshot.data() as {
        openaiKey?: string
        anthropicKey?: string
        googleKey?: string
        xaiKey?: string
      })
    : {}

  const fallbackKeys: ProviderKeys = {
    openai: OPENAI_API_KEY.value() || process.env.OPENAI_API_KEY,
    anthropic: ANTHROPIC_API_KEY.value() || process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY,
    grok: process.env.XAI_API_KEY,
  }

  return {
    openai: userKeys.openaiKey || fallbackKeys.openai || undefined,
    anthropic: userKeys.anthropicKey || fallbackKeys.anthropic || undefined,
    google: userKeys.googleKey || fallbackKeys.google || undefined,
    grok: userKeys.xaiKey || fallbackKeys.grok || undefined,
  }
}
