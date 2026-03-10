/**
 * useWorkflowRunOverlay
 *
 * Transforms node_state_snapshot events into per-node and per-edge overlay data
 * for displaying runtime execution data on the visual builder canvas.
 */

import { useMemo } from 'react'
import type { RunEvent } from '@/hooks/useRunEvents'

export type NodeRunStatus = 'success' | 'error' | 'running' | 'skipped' | 'pending'

export interface NodeRunData {
  nodeId: string
  status: NodeRunStatus
  durationMs?: number
  tokensUsed?: number
  estimatedCost?: number
  executionOrder: number
  output?: string
  error?: string
  visitCount: number
}

export interface EdgeRunData {
  from: string
  to: string
  wasTraversed: boolean
  traversalOrder: number
}

export interface WorkflowRunOverlay {
  nodeData: Map<string, NodeRunData>
  edgeData: Map<string, EdgeRunData>
  isLive: boolean
  totalDuration: number
  totalCost: number
  totalTokens: number
}

function deriveNodeStatus(delta: Record<string, unknown>): NodeRunStatus {
  const status = delta.status as string | undefined
  if (delta.error) return 'error'
  if (status === 'completed' || status === 'running') return 'success'
  if (status === 'waiting_for_input' || status === 'paused') return 'running'
  if (status === 'failed') return 'error'
  return 'success'
}

export function useWorkflowRunOverlay(
  events: RunEvent[],
  isRunning: boolean
): WorkflowRunOverlay | null {
  return useMemo(() => {
    const snapshots = events.filter((e) => e.type === 'node_state_snapshot' && e.details)
    if (snapshots.length === 0) return null

    const nodeData = new Map<string, NodeRunData>()
    const edgeTraversals: Array<{ from: string; to: string; order: number }> = []

    let totalDuration = 0
    let totalCost = 0
    let totalTokens = 0
    let executionOrder = 0

    for (const event of snapshots) {
      const d = event.details!
      const nodeId = d.nodeId as string
      const outputDelta = (d.outputDelta ?? {}) as Record<string, unknown>
      const inputState = (d.inputState ?? {}) as Record<string, unknown>

      executionOrder++
      const durationMs = (outputDelta.durationMs as number) ?? 0
      const tokensUsed = (outputDelta.tokensUsed as number) ?? 0
      const estimatedCost = (outputDelta.estimatedCost as number) ?? 0

      totalDuration += durationMs
      totalCost += estimatedCost
      totalTokens += tokensUsed

      const existing = nodeData.get(nodeId)
      const status = deriveNodeStatus(outputDelta)

      nodeData.set(nodeId, {
        nodeId,
        status,
        durationMs: (existing?.durationMs ?? 0) + durationMs,
        tokensUsed: (existing?.tokensUsed ?? 0) + tokensUsed,
        estimatedCost: (existing?.estimatedCost ?? 0) + estimatedCost,
        executionOrder: existing?.executionOrder ?? executionOrder,
        output: outputDelta.lastOutput as string | undefined,
        error: outputDelta.error as string | undefined,
        visitCount: (existing?.visitCount ?? 0) + 1,
      })

      // Track edge traversals: previous node → this node
      const prevNodeId = inputState.currentNodeId as string | null
      if (prevNodeId && prevNodeId !== nodeId) {
        edgeTraversals.push({ from: prevNodeId, to: nodeId, order: executionOrder })
      }
    }

    const edgeData = new Map<string, EdgeRunData>()
    for (const t of edgeTraversals) {
      const key = `${t.from}->${t.to}`
      if (!edgeData.has(key)) {
        edgeData.set(key, {
          from: t.from,
          to: t.to,
          wasTraversed: true,
          traversalOrder: t.order,
        })
      }
    }

    return {
      nodeData,
      edgeData,
      isLive: isRunning,
      totalDuration,
      totalCost,
      totalTokens,
    }
  }, [events, isRunning])
}
