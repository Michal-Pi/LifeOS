/**
 * RunStatusIndicator Component
 *
 * Live status indicator showing what's happening in a running workflow.
 * Displays current activity, pending agents, token usage, and allows manual stopping.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Run, WorkflowGraph } from '@lifeos/agents'
import type { RunEvent } from '@/hooks/useRunEvents'

interface RunStatusIndicatorProps {
  run: Run
  events: RunEvent[]
  workflowGraph?: WorkflowGraph
  onStop?: () => void
}

export function RunStatusIndicator({
  run,
  events,
  workflowGraph,
  onStop,
}: RunStatusIndicatorProps) {
  // Get the most recent event to determine current activity
  const latestEvent = useMemo(() => {
    return events[events.length - 1]
  }, [events])

  // Capture current time outside useMemo to satisfy react-hooks/purity
  const [now] = useState(() => Date.now())

  // Determine current status message
  const statusMessage = useMemo(() => {
    if (run.status === 'queued') {
      const nextRetryAtMs = run.queueInfo?.nextRetryAtMs
      const retryLabel =
        typeof nextRetryAtMs === 'number' && nextRetryAtMs > now
          ? `retrying in ${Math.max(1, Math.ceil((nextRetryAtMs - now) / 60000))}m`
          : 'retry pending'
      return `⏳ Waiting for capacity - ${retryLabel}`
    }

    // Special handling for constraint pauses
    if (run.status === 'waiting_for_input' && run.constraintPause) {
      const labels: Record<string, string> = {
        budget: 'Budget limit reached',
        max_node_visits: 'Node visit limit reached',
        max_cycles: 'Cycle limit reached',
        max_gap_iterations: 'Gap iteration limit reached',
        max_dialectical_cycles: 'Dialectical cycle limit reached',
      }
      const label = labels[run.constraintPause.constraintType] ?? 'Limit reached'
      return `⚠️ ${label} - action required`
    }

    // Special handling for waiting_for_input status
    if (run.status === 'waiting_for_input') {
      return '❓ Question pending - response required'
    }

    if (run.status !== 'running') {
      return null
    }

    // Check for reasoning model thinking status
    const recentThinking = events
      .slice(-10)
      .reverse()
      .find((e) => e.type === 'status' && e.status === 'thinking')
    if (recentThinking && recentThinking.agentName) {
      const elapsed = (recentThinking.details?.elapsedSeconds as number) ?? 0
      const chunks = (recentThinking.details?.chunksReceived as number) ?? 0
      const silence = (recentThinking.details?.silenceSeconds as number) ?? 0
      const hasTokens = recentThinking.details?.receivedFirstToken === true
      const mins = Math.floor(elapsed / 60)
      const secs = elapsed % 60
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

      if (hasTokens) {
        return `🧠 ${recentThinking.agentName} is generating output... (${timeStr})`
      }
      if (silence > 30) {
        return `🧠 ${recentThinking.agentName} is reasoning... (${timeStr}, stream quiet ${silence}s)`
      }
      return `🧠 ${recentThinking.agentName} is reasoning... (${timeStr}${chunks > 0 ? ', stream active' : ''})`
    }

    // Check for tool calls
    const recentToolCall = events
      .slice(-5)
      .reverse()
      .find((e) => e.type === 'tool_call')
    if (recentToolCall && recentToolCall.toolName) {
      return `🔧 Using tool: ${recentToolCall.toolName}`
    }

    // Check for active agent
    if (latestEvent?.agentName) {
      if (latestEvent.type === 'token') {
        return `💭 ${latestEvent.agentName} is thinking...`
      }
      return `🤖 ${latestEvent.agentName} is working...`
    }

    // Check workflow state for pending nodes
    if (run.workflowState?.currentNodeId && workflowGraph) {
      const currentNode = workflowGraph.nodes.find((n) => n.id === run.workflowState?.currentNodeId)
      if (currentNode) {
        const nodeLabel = currentNode.label || currentNode.id
        if (currentNode.type === 'agent') {
          return `🤖 Agent: ${nodeLabel}`
        } else if (currentNode.type === 'tool') {
          return `🔧 Tool: ${nodeLabel}`
        } else if (currentNode.type === 'human_input') {
          return `👤 Waiting for human input...`
        }
        return `⚙️ Processing: ${nodeLabel}`
      }
    }

    // Check for pending nodes
    if (run.workflowState?.pendingNodes && run.workflowState.pendingNodes.length > 0) {
      const pendingCount = run.workflowState.pendingNodes.length
      if (pendingCount === 1) {
        const nodeId = run.workflowState.pendingNodes[0]
        const node = workflowGraph?.nodes.find((n) => n.id === nodeId)
        const nodeLabel = node?.label || nodeId
        return `⏳ Waiting on: ${nodeLabel}`
      }
      return `⏳ Waiting on ${pendingCount} nodes...`
    }

    // Generic status based on current step
    const progress = run.totalSteps
      ? `Step ${run.currentStep}/${run.totalSteps}`
      : `Step ${run.currentStep}`
    return `⚙️ ${progress}`
  }, [run, latestEvent, events, workflowGraph, now])

  // Calculate token usage and cost
  const { tokens, cost } = useMemo(() => {
    return {
      tokens: run.tokensUsed ?? 0,
      cost: run.estimatedCost ?? 0,
    }
  }, [run.tokensUsed, run.estimatedCost])

  if (run.status !== 'running' && run.status !== 'waiting_for_input' && run.status !== 'queued') {
    return null
  }

  return (
    <div className="run-status-indicator">
      <div className="status-content">
        <div className="status-message">
          <div className="status-spinner" />
          <span>{statusMessage}</span>
        </div>

        <div className="status-metrics">
          <div className="metric">
            <span className="metric-label">Tokens:</span>
            <span className="metric-value">{tokens.toLocaleString()}</span>
          </div>
          {cost > 0 && (
            <div className="metric">
              <span className="metric-label">Cost:</span>
              <span className="metric-value">${cost.toFixed(4)}</span>
            </div>
          )}
        </div>

        {onStop && (
          <Button variant="ghost" size="sm" onClick={onStop} className="stop-button">
            ⏹ Stop
          </Button>
        )}
      </div>
    </div>
  )
}
