/**
 * Firestore Mailbox AI Tool Settings Repository
 *
 * Manages user-customizable mailbox AI tool configurations.
 * Follows the same pattern as firestoreAIToolSettingsRepository.ts.
 */

import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import type { MailboxAIToolSettings, MailboxAIToolConfig, MailboxAIToolId } from '@lifeos/agents'
import { createDefaultMailboxAIToolSettings, DEFAULT_MAILBOX_AI_TOOLS } from '@lifeos/agents'

function getSettingsDocRef(userId: string) {
  return doc(getFirestoreClient(), `users/${userId}/settings/mailboxAITools`)
}

export async function getMailboxAIToolSettings(userId: string): Promise<MailboxAIToolSettings> {
  const docRef = getSettingsDocRef(userId)
  const snapshot = await getDoc(docRef)

  if (!snapshot.exists()) {
    return createDefaultMailboxAIToolSettings()
  }

  const data = snapshot.data() as MailboxAIToolSettings

  // Merge with defaults to ensure all tools are present
  const mergedTools = { ...DEFAULT_MAILBOX_AI_TOOLS }
  for (const [toolId, config] of Object.entries(data.tools || {})) {
    mergedTools[toolId as MailboxAIToolId] = {
      ...DEFAULT_MAILBOX_AI_TOOLS[toolId as MailboxAIToolId],
      ...config,
    }
  }

  return {
    ...data,
    tools: mergedTools,
  }
}

export async function updateMailboxAIToolConfig(
  userId: string,
  toolId: MailboxAIToolId,
  updates: Partial<MailboxAIToolConfig>
): Promise<void> {
  const currentSettings = await getMailboxAIToolSettings(userId)
  const currentTool = currentSettings.tools[toolId]

  const updatedTool: MailboxAIToolConfig = {
    ...currentTool,
    ...updates,
    toolId, // Ensure toolId is preserved
    updatedAtMs: Date.now(),
  }

  const updatedSettings: MailboxAIToolSettings = {
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

export async function resetMailboxAIToolToDefault(
  userId: string,
  toolId: MailboxAIToolId
): Promise<void> {
  const currentSettings = await getMailboxAIToolSettings(userId)

  const updatedSettings: MailboxAIToolSettings = {
    ...currentSettings,
    tools: {
      ...currentSettings.tools,
      [toolId]: { ...DEFAULT_MAILBOX_AI_TOOLS[toolId] },
    },
    updatedAtMs: Date.now(),
  }

  const docRef = getSettingsDocRef(userId)
  await setDoc(docRef, updatedSettings, { merge: true })
}

export async function resetAllMailboxAIToolsToDefault(userId: string): Promise<void> {
  const docRef = getSettingsDocRef(userId)
  await setDoc(docRef, createDefaultMailboxAIToolSettings())
}

export async function updateCustomPriorityPrompt(
  userId: string,
  customPriorityPrompt: string | undefined
): Promise<void> {
  const currentSettings = await getMailboxAIToolSettings(userId)

  const updatedSettings: MailboxAIToolSettings = {
    ...currentSettings,
    customPriorityPrompt,
    updatedAtMs: Date.now(),
  }

  const docRef = getSettingsDocRef(userId)
  await setDoc(docRef, updatedSettings, { merge: true })
}

export function subscribeToMailboxAIToolSettings(
  userId: string,
  callback: (settings: MailboxAIToolSettings) => void
): Unsubscribe {
  const docRef = getSettingsDocRef(userId)

  return onSnapshot(docRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(createDefaultMailboxAIToolSettings())
      return
    }

    const data = snapshot.data() as MailboxAIToolSettings

    // Merge with defaults
    const mergedTools = { ...DEFAULT_MAILBOX_AI_TOOLS }
    for (const [toolId, config] of Object.entries(data.tools || {})) {
      mergedTools[toolId as MailboxAIToolId] = {
        ...DEFAULT_MAILBOX_AI_TOOLS[toolId as MailboxAIToolId],
        ...config,
      }
    }

    callback({
      ...data,
      tools: mergedTools,
    })
  })
}
