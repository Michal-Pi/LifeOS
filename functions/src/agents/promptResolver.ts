import type { PromptReference } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'

const replaceVariables = (content: string, variables: Record<string, string>) => {
  let result = content
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(regex, value)
  }
  return result
}

export const resolvePrompt = async (
  userId: string,
  reference: PromptReference,
  runtimeVariables?: Record<string, string>
): Promise<string> => {
  let content = ''

  if (reference.type === 'shared' && reference.templateId) {
    const db = getFirestore()
    const templateRef = db.doc(`users/${userId}/promptLibrary/${reference.templateId}`)
    const snapshot = await templateRef.get()
    if (!snapshot.exists) {
      throw new Error(`Prompt template ${reference.templateId} not found`)
    }
    const data = snapshot.data() as { content?: string; usageCount?: number }
    content = data.content ?? ''
    await templateRef.update({
      usageCount: (data.usageCount ?? 0) + 1,
      lastUsedAtMs: Date.now(),
    })
  } else {
    content = reference.customContent ?? ''
  }

  const allVariables = { ...reference.variables, ...runtimeVariables }
  return replaceVariables(content, allVariables)
}
