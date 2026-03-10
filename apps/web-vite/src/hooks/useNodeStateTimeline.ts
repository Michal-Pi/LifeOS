/**
 * useNodeStateTimeline
 *
 * Filters node_state_snapshot events from run events into an ordered timeline
 * of per-node execution state entries for the StateTimeline component.
 */

import { useMemo } from 'react'
import type { RunEvent } from '@/hooks/useRunEvents'

export interface NodeStateEntry {
  nodeId: string
  nodeType: string
  nodeLabel: string
  agentId?: string
  timestampMs: number
  stepIndex: number
  inputState: {
    lastOutput: string
    namedOutputKeys: string[]
    currentNodeId: string | null
    totalTokensUsed: number
    totalEstimatedCost: number
    visitedCount: number
    status: string
  }
  outputDelta: {
    lastOutput?: string
    namedOutputKeys?: string[]
    status: string
    tokensUsed?: number
    estimatedCost?: number
    error?: string
    stepOutput?: string
    durationMs?: number
  }
  edgesFromNode: Array<{ to: string; conditionType: string }>
}

export function useNodeStateTimeline(events: RunEvent[]): NodeStateEntry[] {
  return useMemo(() => {
    return events
      .filter((e) => e.type === 'node_state_snapshot' && e.details)
      .map((e) => {
        const d = e.details!
        return {
          nodeId: d.nodeId as string,
          nodeType: d.nodeType as string,
          nodeLabel: (d.nodeLabel as string) ?? (d.nodeId as string),
          agentId: e.agentId,
          timestampMs: e.timestampMs,
          stepIndex: (d.stepIndex as number) ?? 0,
          inputState: d.inputState as NodeStateEntry['inputState'],
          outputDelta: d.outputDelta as NodeStateEntry['outputDelta'],
          edgesFromNode: (d.edgesFromNode as NodeStateEntry['edgesFromNode']) ?? [],
        }
      })
      .sort((a, b) => a.timestampMs - b.timestampMs)
  }, [events])
}
