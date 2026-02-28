/**
 * Firestore AI Tool Settings Repository
 *
 * Manages user-customizable AI tool configurations.
 */

import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import type { AIToolSettings, AIToolConfig, AIToolId } from '@lifeos/agents'
import { createDefaultAIToolSettings, DEFAULT_AI_TOOLS } from '@lifeos/agents'

function getSettingsDocRef(userId: string) {
  return doc(getFirestoreClient(), `users/${userId}/settings/aiTools`)
}

export async function getAIToolSettings(userId: string): Promise<AIToolSettings> {
  const docRef = getSettingsDocRef(userId)
  const snapshot = await getDoc(docRef)

  if (!snapshot.exists()) {
    return createDefaultAIToolSettings()
  }

  const data = snapshot.data() as AIToolSettings

  // Merge with defaults to ensure all tools are present
  const mergedTools = { ...DEFAULT_AI_TOOLS }
  for (const [toolId, config] of Object.entries(data.tools || {})) {
    mergedTools[toolId as AIToolId] = {
      ...DEFAULT_AI_TOOLS[toolId as AIToolId],
      ...config,
    }
  }

  return {
    ...data,
    tools: mergedTools,
  }
}

export async function updateAIToolConfig(
  userId: string,
  toolId: AIToolId,
  updates: Partial<AIToolConfig>
): Promise<void> {
  const currentSettings = await getAIToolSettings(userId)
  const currentTool = currentSettings.tools[toolId]

  const updatedTool: AIToolConfig = {
    ...currentTool,
    ...updates,
    toolId, // Ensure toolId is preserved
    updatedAtMs: Date.now(),
  }

  const updatedSettings: AIToolSettings = {
    ...currentSettings,
    tools: {
      ...currentSettings.tools,
      [toolId]: updatedTool,
    },
    updatedAtMs: Date.now(),
  }

  const docRef = getSettingsDocRef(userId)
  await setDoc(docRef, updatedSettings, { merge: true })
}

export async function resetAIToolToDefault(userId: string, toolId: AIToolId): Promise<void> {
  const currentSettings = await getAIToolSettings(userId)

  const updatedSettings: AIToolSettings = {
    ...currentSettings,
    tools: {
      ...currentSettings.tools,
      [toolId]: { ...DEFAULT_AI_TOOLS[toolId] },
    },
    updatedAtMs: Date.now(),
  }

  const docRef = getSettingsDocRef(userId)
  await setDoc(docRef, updatedSettings, { merge: true })
}

export async function resetAllAIToolsToDefault(userId: string): Promise<void> {
  const docRef = getSettingsDocRef(userId)
  await setDoc(docRef, createDefaultAIToolSettings())
}

export function subscribeToAIToolSettings(
  userId: string,
  callback: (settings: AIToolSettings) => void
): Unsubscribe {
  const docRef = getSettingsDocRef(userId)

  return onSnapshot(docRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(createDefaultAIToolSettings())
      return
    }

    const data = snapshot.data() as AIToolSettings

    // Merge with defaults
    const mergedTools = { ...DEFAULT_AI_TOOLS }
    for (const [toolId, config] of Object.entries(data.tools || {})) {
      mergedTools[toolId as AIToolId] = {
        ...DEFAULT_AI_TOOLS[toolId as AIToolId],
        ...config,
      }
    }

    callback({
      ...data,
      tools: mergedTools,
    })
  })
}
