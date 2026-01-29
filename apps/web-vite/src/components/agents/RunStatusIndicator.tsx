/**
 * RunStatusIndicator Component
 *
 * Live status indicator showing what's happening in a running workflow.
 * Displays current activity, pending agents, token usage, and allows manual stopping.
 */

import { useMemo } from 'react'
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

  // Determine current status message
  const statusMessage = useMemo(() => {
    if (run.status !== 'running') {
      return null
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
  }, [run, latestEvent, events, workflowGraph])

  // Calculate token usage and cost
  const { tokens, cost } = useMemo(() => {
    return {
      tokens: run.tokensUsed ?? 0,
      cost: run.estimatedCost ?? 0,
    }
  }, [run.tokensUsed, run.estimatedCost])

  if (run.status !== 'running') {
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
