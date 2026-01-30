/**
 * MessageCarousel Component
 *
 * Interactive carousel showing live execution messages from a running workflow.
 * - Navigable message history with arrow keys
 * - Live view shows current activity
 * - Integrated agent question/response interface
 * - Consistent height with scrollable content
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { useHotkeys } from 'react-hotkeys-hook'
import type { Run, WorkflowGraph, Message } from '@lifeos/agents'
import type { RunEvent } from '@/hooks/useRunEvents'

interface CarouselMessage {
  id: string
  timestamp: number
  type: 'status' | 'agent_message' | 'tool_call' | 'question' | 'system' | 'user'
  content: string
  agentName?: string
  metadata?: Record<string, unknown>
}

interface MessageCarouselProps {
  run: Run
  events: RunEvent[]
  messages?: Message[]
  workflowGraph?: WorkflowGraph
  onStop?: () => void
  onProvideInput?: (response: string) => Promise<void>
  isSubmittingInput?: boolean
  pendingInput?: { prompt: string; nodeId: string }
  agentName?: string
}

export function MessageCarousel({
  run,
  events,
  messages = [],
  workflowGraph,
  onStop,
  onProvideInput,
  isSubmittingInput = false,
  pendingInput,
  agentName,
}: MessageCarouselProps) {
  const [userResponse, setUserResponse] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [manualNavigationIndex, setManualNavigationIndex] = useState<number | null>(null)

  // Build carousel messages from conversation messages and events
  const carouselMessages = useMemo(() => {
    const msgs: CarouselMessage[] = []
    const fallbackTimestamp = run.startedAtMs || 0

    // Add conversation messages (primary content)
    messages.forEach((msg) => {
      if (msg.role === 'assistant' && msg.content) {
        msgs.push({
          id: `msg-${msg.messageId}`,
          timestamp: msg.timestampMs,
          type: 'agent_message',
          content: msg.content,
          agentName: msg.agentId ? undefined : undefined, // TODO: resolve agent name from agentId
        })
      } else if (msg.role === 'user' && msg.content) {
        msgs.push({
          id: `msg-${msg.messageId}`,
          timestamp: msg.timestampMs,
          type: 'user',
          content: msg.content,
        })
      }

      // Add tool calls from message
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach((tc, tcIdx) => {
          msgs.push({
            id: `msg-tool-${msg.messageId}-${tcIdx}`,
            timestamp: msg.timestampMs,
            type: 'tool_call',
            content: `🔧 **Tool Used:** ${tc.toolName}\n\n**Input:**\n\`\`\`json\n${JSON.stringify(tc.parameters, null, 2)}\n\`\`\``,
            metadata: { toolName: tc.toolName, toolCallId: tc.toolCallId },
          })
        })
      }

      // Add tool results from message
      if (msg.toolResults && msg.toolResults.length > 0) {
        msg.toolResults.forEach((tr, trIdx) => {
          const resultStr =
            typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result, null, 2)
          msgs.push({
            id: `msg-tool-result-${msg.messageId}-${trIdx}`,
            timestamp: msg.timestampMs,
            type: 'tool_call',
            content: `✅ **Tool Result**\n\n\`\`\`\n${resultStr}\n\`\`\`${tr.error ? `\n\n❌ **Error:** ${tr.error}` : ''}`,
            metadata: { toolCallId: tr.toolCallId },
          })
        })
      }
    })

    // Add event-based messages for real-time updates
    events.forEach((event, idx) => {
      // Agent messages or status updates with output
      if (event.output) {
        msgs.push({
          id: `event-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'agent_message',
          content: event.output,
          agentName: event.agentName,
        })
      }
      // Tool calls
      else if (event.type === 'tool_call' && event.toolName) {
        const toolInput = event.details?.input || event.details
        const inputStr = toolInput
          ? `**Input:**\n\`\`\`json\n${JSON.stringify(toolInput, null, 2)}\n\`\`\``
          : ''

        msgs.push({
          id: `tool-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'tool_call',
          content: `🔧 **Tool Used:** ${event.toolName}\n\n${inputStr}`,
          metadata: { toolName: event.toolName },
        })
      }
      // Tool results
      else if (event.type === 'tool_result' && event.toolName) {
        const resultStr =
          typeof event.toolResult === 'string'
            ? event.toolResult
            : JSON.stringify(event.toolResult, null, 2)

        msgs.push({
          id: `tool-result-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'tool_call',
          content: `✅ **Tool Result:** ${event.toolName}\n\n\`\`\`\n${resultStr}\n\`\`\``,
          metadata: { toolName: event.toolName },
        })
      }
      // Error events
      else if (event.type === 'error' && event.errorMessage) {
        msgs.push({
          id: `error-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'system',
          content: `❌ **Error:** ${event.errorMessage}`,
        })
      }
    })

    // Add pending question if exists
    if (pendingInput && run.status === 'waiting_for_input') {
      msgs.push({
        id: 'question-pending',
        timestamp: fallbackTimestamp,
        type: 'question',
        content: pendingInput.prompt,
        agentName: agentName,
      })
    }

    // Add live status message if running
    if (run.status === 'running') {
      const latestEvent = events[events.length - 1]
      let statusContent = '⚙️ Workflow is running...'

      // Check for recent tool calls
      const recentToolCall = events
        .slice(-5)
        .reverse()
        .find((e) => e.type === 'tool_call')
      if (recentToolCall && recentToolCall.toolName) {
        statusContent = `🔧 Using tool: **${recentToolCall.toolName}**`
      } else if (latestEvent?.agentName) {
        if (latestEvent.type === 'token') {
          statusContent = `💭 **${latestEvent.agentName}** is thinking...`
        } else {
          statusContent = `🤖 **${latestEvent.agentName}** is working...`
        }
      } else if (run.workflowState?.currentNodeId && workflowGraph) {
        const currentNode = workflowGraph.nodes.find(
          (n) => n.id === run.workflowState?.currentNodeId
        )
        if (currentNode) {
          const nodeLabel = currentNode.label || currentNode.id
          if (currentNode.type === 'agent') {
            statusContent = `🤖 Agent: **${nodeLabel}**`
          } else if (currentNode.type === 'tool') {
            statusContent = `🔧 Tool: **${nodeLabel}**`
          } else if (currentNode.type === 'human_input') {
            statusContent = `👤 Waiting for human input...`
          } else {
            statusContent = `⚙️ Processing: **${nodeLabel}**`
          }
        }
      }

      msgs.push({
        id: 'live-status',
        timestamp: fallbackTimestamp,
        type: 'status',
        content: statusContent,
      })
    }

    // Sort all messages by timestamp
    msgs.sort((a, b) => a.timestamp - b.timestamp)

    return msgs
  }, [events, messages, run, workflowGraph, pendingInput, agentName])

  // Determine current index: manual navigation takes precedence, otherwise show latest
  const currentIndex =
    manualNavigationIndex !== null
      ? Math.min(manualNavigationIndex, carouselMessages.length - 1)
      : Math.max(0, carouselMessages.length - 1)

  const currentMessage = carouselMessages[currentIndex] || null

  const handlePrevious = () => {
    const newIndex = Math.max(0, currentIndex - 1)
    setManualNavigationIndex(newIndex)
  }

  const handleNext = () => {
    const newIndex = Math.min(carouselMessages.length - 1, currentIndex + 1)
    // If navigating to the last message, reset to auto mode
    if (newIndex === carouselMessages.length - 1) {
      setManualNavigationIndex(null)
    } else {
      setManualNavigationIndex(newIndex)
    }
  }

  const handleSubmitResponse = async () => {
    if (onProvideInput && userResponse.trim()) {
      await onProvideInput(userResponse.trim())
      setUserResponse('')
    }
  }

  // Keyboard navigation
  useHotkeys('left', handlePrevious, [manualNavigationIndex, carouselMessages.length])
  useHotkeys('right', handleNext, [manualNavigationIndex, carouselMessages.length])
  useHotkeys(
    'cmd+enter, ctrl+enter',
    (event) => {
      if (currentMessage?.type === 'question') {
        event.preventDefault()
        void handleSubmitResponse()
      }
    },
    { enableOnFormTags: true },
    [userResponse, currentMessage, onProvideInput]
  )

  // Focus textarea when question appears
  useEffect(() => {
    if (currentMessage?.type === 'question' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [currentMessage?.type])

  if (run.status !== 'running' && run.status !== 'waiting_for_input') {
    return null
  }

  const isLiveView = currentIndex === carouselMessages.length - 1
  const isQuestion = currentMessage?.type === 'question'

  // Token and cost metrics
  const tokens = run.tokensUsed ?? 0
  const cost = run.estimatedCost ?? 0

  return (
    <div className="message-carousel">
      <div className="carousel-header">
        <div className="carousel-title">
          {isQuestion ? (
            <span className="question-indicator">❓ Agent Question</span>
          ) : isLiveView ? (
            <span className="live-indicator">
              <span className="live-dot" />
              Live View
            </span>
          ) : (
            <span>Message History</span>
          )}
        </div>
        <div className="carousel-metrics">
          <span className="metric">
            <span className="metric-label">Tokens:</span>
            <span className="metric-value">{tokens.toLocaleString()}</span>
          </span>
          {cost > 0 && (
            <span className="metric">
              <span className="metric-label">Cost:</span>
              <span className="metric-value">${cost.toFixed(4)}</span>
            </span>
          )}
        </div>
        {onStop && run.status === 'running' && (
          <Button variant="ghost" size="sm" onClick={onStop} className="stop-button">
            ⏹ Stop
          </Button>
        )}
      </div>

      <div className="carousel-body">
        <button
          className="carousel-nav carousel-nav-left"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          aria-label="Previous message"
        >
          ←
        </button>

        <div className="carousel-content">
          {currentMessage ? (
            <>
              <div className="message-meta">
                {currentMessage.agentName && (
                  <span className="message-agent">🤖 {currentMessage.agentName}</span>
                )}
                <span className="message-position">
                  {currentIndex + 1} / {carouselMessages.length}
                </span>
              </div>

              <div className="message-body">
                {isQuestion ? (
                  <>
                    <div className="question-prompt">
                      <MarkdownRenderer content={currentMessage.content} />
                    </div>
                    <div className="question-input">
                      <textarea
                        ref={textareaRef}
                        value={userResponse}
                        onChange={(e) => setUserResponse(e.target.value)}
                        placeholder="Type your response here..."
                        rows={5}
                        disabled={isSubmittingInput}
                        className="response-textarea"
                      />
                      <div className="question-footer">
                        <div className="question-meta">
                          {userResponse.length > 0 && (
                            <span className="char-count">{userResponse.length} characters</span>
                          )}
                          {!isSubmittingInput && (
                            <span className="keyboard-hint">⌘↵ to submit</span>
                          )}
                        </div>
                        <Button
                          onClick={handleSubmitResponse}
                          disabled={!userResponse.trim() || isSubmittingInput}
                          size="sm"
                        >
                          {isSubmittingInput ? 'Submitting...' : 'Submit Response'}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <MarkdownRenderer content={currentMessage.content} />
                )}
              </div>
            </>
          ) : (
            <div className="message-body empty-state">
              <p>No messages yet...</p>
            </div>
          )}
        </div>

        <button
          className="carousel-nav carousel-nav-right"
          onClick={handleNext}
          disabled={currentIndex === carouselMessages.length - 1}
          aria-label="Next message"
        >
          →
        </button>
      </div>
    </div>
  )
}
