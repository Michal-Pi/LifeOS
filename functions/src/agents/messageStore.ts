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

const MESSAGE_LIMIT = 200
const COMPACT_WINDOW = 60
const MIN_COMPACT_MESSAGES = 20
const MAX_SUMMARY_CHARS = 4000
const SUMMARY_PREFIX = 'Summary of earlier messages (auto-generated):'
const HISTORY_CONTEXT_LIMIT = 50
// Firestore batch write limit is 10 MB, so we use a conservative estimate
// to commit more frequently and avoid "Transaction too big" errors
const MAX_BATCH_OPS = 100

export async function recordMessage(
  input: StoreMessageInput,
  options?: { skipPrune?: boolean }
): Promise<void> {
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

  if (!options?.skipPrune) {
    await pruneAndCompactMessages(input.userId, input.runId)
  }
}

async function pruneAndCompactMessages(userId: string, runId: string): Promise<void> {
  const db = getFirestore()
  const messagesRef = db.collection(`users/${userId}/runs/${runId}/messages`)
  const snapshot = await messagesRef
    .orderBy('timestampMs', 'asc')
    .limit(MESSAGE_LIMIT + COMPACT_WINDOW)
    .get()

  if (snapshot.size <= MESSAGE_LIMIT) {
    return
  }

  const overflowCount = snapshot.size - MESSAGE_LIMIT
  const overflowDocs = snapshot.docs.slice(0, overflowCount)

  if (overflowDocs.length < MIN_COMPACT_MESSAGES) {
    let batch = db.batch()
    let pending = 0
    for (const doc of overflowDocs) {
      batch.delete(doc.ref)
      pending += 1

      // Use smaller batch size to avoid "Transaction too big" errors
      if (pending >= MAX_BATCH_OPS) {
        await batch.commit()
        batch = db.batch()
        pending = 0
      }
    }
    if (pending > 0) {
      await batch.commit()
    }
    return
  }

  const summaryLines = overflowDocs
    .map((doc) => doc.data())
    .map((message) => formatSummaryLine(message.role, message.content))
    .filter((line) => line.length > 0)
  const summaryBody = summaryLines.join('\n').slice(0, MAX_SUMMARY_CHARS)
  const summaryContent = `${SUMMARY_PREFIX}\n${summaryBody}`.slice(0, MAX_SUMMARY_CHARS)
  const summaryDocRef = messagesRef.doc()
  const lastSummarized = overflowDocs[overflowDocs.length - 1]?.data()
  const summaryTimestampMs =
    typeof lastSummarized?.timestampMs === 'number' ? lastSummarized.timestampMs : Date.now()

  let batch = db.batch()
  let pending = 0

  // Add summary document
  batch.set(summaryDocRef, {
    messageId: summaryDocRef.id || randomUUID(),
    runId,
    role: 'assistant',
    content: summaryContent,
    timestampMs: summaryTimestampMs,
  })
  pending += 1

  // Delete overflow documents
  for (const doc of overflowDocs) {
    batch.delete(doc.ref)
    pending += 1

    // Use smaller batch size to avoid "Transaction too big" errors
    if (pending >= MAX_BATCH_OPS) {
      await batch.commit()
      batch = db.batch()
      pending = 0
    }
  }

  // Commit any remaining operations
  if (pending > 0) {
    await batch.commit()
  }
}

function formatSummaryLine(role: MessageRole, content: string): string {
  const normalized = (content ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  const truncated = normalized.length > 200 ? `${normalized.slice(0, 200)}…` : normalized
  return `- ${role}: ${truncated}`
}

export async function buildConversationContext(
  userId: string,
  runId: string,
  options?: { limit?: number }
): Promise<string> {
  const db = getFirestore()
  const limitCount = options?.limit ?? HISTORY_CONTEXT_LIMIT
  if (limitCount <= 0) {
    return ''
  }
  const snapshot = await db
    .collection(`users/${userId}/runs/${runId}/messages`)
    .orderBy('timestampMs', 'desc')
    .limit(limitCount)
    .get()

  if (snapshot.empty) {
    return ''
  }

  const messages = snapshot.docs.map((doc) => doc.data()).reverse()
  const lines = messages
    .map((message) => formatHistoryLine(message.role as MessageRole, message.content as string))
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return ''
  }

  return `Conversation history (most recent last):\n${lines.join('\n')}`
}

function formatHistoryLine(role: MessageRole, content: string): string {
  const normalized = (content ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  const truncated = normalized.length > 300 ? `${normalized.slice(0, 300)}...` : normalized
  return `- ${role}: ${truncated}`
}
