import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'

import type { ProviderKeys } from './providerService.js'

export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

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
