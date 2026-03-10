/**
 * Run Events
 *
 * Emits real-time run events for streaming output and tool status updates (Phase 6B).
 */

import { getFirestore } from 'firebase-admin/firestore'

export type RunEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'status'
  | 'error'
  | 'final'
  // Step progress events
  | 'step_started'
  | 'step_completed'
  // Deep research events
  | 'deep_research_phase'
  // Dialectical workflow events
  | 'dialectical_phase'
  | 'dialectical_thesis'
  | 'dialectical_negation'
  | 'dialectical_contradiction'
  | 'dialectical_synthesis'
  | 'dialectical_meta'
  | 'dialectical_final_memo'
  // Oracle workflow events
  | 'oracle_phase'
  | 'oracle_gate_result'
  | 'oracle_council_complete'
  | 'oracle_human_gate'
  | 'oracle_consistency_check'
  | 'oracle_remediation_planned'
  | 'oracle_remediation_evidence_added'
  | 'oracle_remediation_validated'
  | 'oracle_finalize_current_findings'
  // Plan management events
  | 'plan_approved'

export type RunEvent = {
  type: RunEventType
  runId: string
  workflowId?: string
  agentId?: string
  agentName?: string
  provider?: string
  model?: string
  step?: number
  timestampMs: number
  delta?: string
  output?: string
  status?: string
  errorMessage?: string
  errorCategory?: string
  toolName?: string
  toolCallId?: string
  toolResult?: unknown
  details?: Record<string, unknown>
}

export type RunEventWriter = {
  writeEvent: (event: Omit<RunEvent, 'timestampMs' | 'runId'>) => Promise<void>
  appendToken: (
    delta: string,
    meta: Omit<RunEvent, 'timestampMs' | 'type' | 'delta' | 'runId'>
  ) => Promise<void>
  flushTokens: (meta: Omit<RunEvent, 'timestampMs' | 'type' | 'delta' | 'runId'>) => Promise<void>
}

const TOKEN_FLUSH_INTERVAL_MS = 250
const TOKEN_FLUSH_SIZE = 200

export function createRunEventWriter(params: {
  userId: string
  runId: string
  workflowId?: string
}): RunEventWriter {
  const db = getFirestore()
  const eventsRef = db.collection(`users/${params.userId}/runs/${params.runId}/events`)

  let tokenBuffer = ''
  let lastFlushMs = 0

  const writeEvent = async (event: Omit<RunEvent, 'timestampMs' | 'runId'>): Promise<void> => {
    await eventsRef.add({
      ...event,
      runId: params.runId,
      workflowId: params.workflowId,
      timestampMs: Date.now(),
    })
  }

  const flushTokens = async (
    meta: Omit<RunEvent, 'timestampMs' | 'type' | 'delta' | 'runId'>
  ): Promise<void> => {
    if (!tokenBuffer) {
      return
    }
    const delta = tokenBuffer
    tokenBuffer = ''
    lastFlushMs = Date.now()
    await writeEvent({
      ...meta,
      type: 'token',
      delta,
    })
  }

  const appendToken = async (
    delta: string,
    meta: Omit<RunEvent, 'timestampMs' | 'type' | 'delta' | 'runId'>
  ): Promise<void> => {
    if (!delta) {
      return
    }
    tokenBuffer += delta
    const now = Date.now()
    if (tokenBuffer.length >= TOKEN_FLUSH_SIZE || now - lastFlushMs >= TOKEN_FLUSH_INTERVAL_MS) {
      await flushTokens(meta)
    }
  }

  return {
    writeEvent,
    appendToken,
    flushTokens,
  }
}
