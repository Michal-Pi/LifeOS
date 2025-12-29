/**
 * Message Store
 *
 * Persists agent messages for conversation memory (Phase 6A).
 */

import { randomUUID } from 'crypto'
import type { MessageRole, ToolCall, ToolResult } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'

export interface StoreMessageInput {
  userId: string
  runId: string
  agentId?: string
  role: MessageRole
  content: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  tokensUsed?: number
}

export async function recordMessage(input: StoreMessageInput): Promise<void> {
  const db = getFirestore()
  const messagesRef = db.collection(`users/${input.userId}/runs/${input.runId}/messages`)
  const docRef = messagesRef.doc()
  const messageId = docRef.id || randomUUID()

  await docRef.set({
    messageId,
    runId: input.runId,
    agentId: input.agentId,
    role: input.role,
    content: input.content,
    toolCalls: input.toolCalls,
    toolResults: input.toolResults,
    tokensUsed: input.tokensUsed,
    timestampMs: Date.now(),
  })
}
