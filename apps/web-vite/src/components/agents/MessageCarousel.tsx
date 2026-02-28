/**
 * MessageCarousel Component
 *
 * Interactive carousel showing execution messages from a workflow run.
 * - Navigable message history with arrow keys
 * - Live view shows current activity for running workflows
 * - Integrated agent question/response interface
 * - Final output slide with markdown rendering
 * - Per-message header bar with author, receiver, metrics, Save as Note
 * - Consistent height with scrollable content
 */

import type { Run, WorkflowGraph, Message } from '@lifeos/agents'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import type { RunEvent } from '@/hooks/useRunEvents'

/**
 * Format dialectical phase name for display
 */
function formatPhaseName(phase: string): string {
  const phaseNames: Record<string, string> = {
    retrieve_context: 'Retrieve Context',
    thesis_generation: 'Thesis Generation',
    cross_negation: 'Cross Negation',
    contradiction_crystallization: 'Contradiction Crystallization',
    sublation: 'Sublation',
    meta_reflection: 'Meta Reflection',
  }
  return phaseNames[phase] ?? phase
}

interface CarouselMessage {
  id: string
  timestamp: number
  type:
    | 'status'
    | 'agent_message'
    | 'tool_call'
    | 'question'
    | 'system'
    | 'user'
    // Dialectical message types
    | 'dialectical_phase'
    | 'dialectical_thesis'
    | 'dialectical_negation'
    | 'dialectical_contradiction'
    | 'dialectical_synthesis'
    | 'dialectical_meta'
    | 'error'
  content: string
  author?: string
  receiver?: string
  tokensUsed?: number
  estimatedCost?: number
  metadata?: Record<string, unknown>
}

interface MessageCarouselProps {
  run: Run
  events: RunEvent[]
  messages?: Message[]
  workflowGraph?: WorkflowGraph
  finalOutput?: string
  onStop?: () => void
  onProvideInput?: (response: string) => Promise<void>
  onSaveAsNote?: (content: string) => Promise<void>
  onSaveAllAsNote?: (content: string) => Promise<void>
  isSavingNote?: boolean
  isSavingAll?: boolean
  isSubmittingInput?: boolean
  pendingInput?: { prompt: string; nodeId: string }
  agentName?: string
}

export function MessageCarousel({
  run,
  events,
  messages = [],
  workflowGraph,
  finalOutput,
  onStop,
  onProvideInput,
  onSaveAsNote,
  onSaveAllAsNote,
  isSavingNote = false,
  isSavingAll = false,
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

    // Message 0: Original prompt / goal
    msgs.push({
      id: 'original-prompt',
      timestamp: fallbackTimestamp,
      type: 'user',
      content: run.goal,
      author: 'User',
      receiver: 'Workflow',
    })

    // Add conversation messages (primary content)
    messages.forEach((msg) => {
      if (msg.role === 'assistant' && msg.content) {
        msgs.push({
          id: `msg-${msg.messageId}`,
          timestamp: msg.timestampMs,
          type: 'agent_message',
          content: msg.content,
          author: msg.agentId ?? 'Agent',
          receiver: 'User',
          tokensUsed: msg.tokensUsed,
        })
      } else if (msg.role === 'user' && msg.content) {
        msgs.push({
          id: `msg-${msg.messageId}`,
          timestamp: msg.timestampMs,
          type: 'user',
          content: msg.content,
          author: 'User',
          receiver: 'Agent',
        })
      }

      // Add tool calls from message
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach((tc, tcIdx) => {
          msgs.push({
            id: `msg-tool-${msg.messageId}-${tcIdx}`,
            timestamp: msg.timestampMs,
            type: 'tool_call',
            content: `**Tool Used:** ${tc.toolName}\n\n**Input:**\n\`\`\`json\n${JSON.stringify(tc.parameters, null, 2)}\n\`\`\``,
            author: msg.agentId ?? 'Agent',
            receiver: tc.toolName,
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
            content: `**Tool Result**\n\n\`\`\`\n${resultStr}\n\`\`\`${tr.error ? `\n\n**Error:** ${tr.error}` : ''}`,
            author: 'Tool',
            receiver: msg.agentId ?? 'Agent',
            metadata: { toolCallId: tr.toolCallId },
          })
        })
      }
    })

    // Add event-based messages for real-time updates
    events.forEach((event, idx) => {
      // Dialectical workflow events - handle these first
      if (event.type === 'dialectical_phase') {
        const details = event.details as Record<string, unknown> | undefined
        const phase = details?.phase ?? 'unknown'
        const cycleNumber = details?.cycleNumber ?? 0
        msgs.push({
          id: `dialectical-phase-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'dialectical_phase',
          content: `**Cycle ${cycleNumber} - ${formatPhaseName(String(phase))}**`,
          author: 'Dialectical',
          metadata: { phase, cycleNumber },
        })
      } else if (event.type === 'dialectical_thesis' && event.output) {
        const details = event.details as Record<string, unknown> | undefined
        const lens = details?.lens ?? 'unknown'
        msgs.push({
          id: `dialectical-thesis-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'dialectical_thesis',
          content: event.output,
          author: event.agentName ?? 'Thesis Agent',
          receiver: `Lens: ${lens}`,
          metadata: { lens, cycleNumber: details?.cycleNumber },
        })
      } else if (event.type === 'dialectical_negation' && event.output) {
        const details = event.details as Record<string, unknown> | undefined
        msgs.push({
          id: `dialectical-negation-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'dialectical_negation',
          content: event.output,
          author: event.agentName ?? 'Negation Agent',
          receiver: `Target: ${details?.targetThesisLens ?? 'unknown'}`,
          metadata: details,
        })
      } else if (event.type === 'dialectical_contradiction') {
        const details = event.details as Record<string, unknown> | undefined
        const contradictions = (details?.contradictions ?? []) as Array<{
          type: string
          severity: string
          description: string
        }>
        const summary =
          contradictions.length > 0
            ? contradictions
                .slice(0, 5)
                .map((c) => `- **${c.severity}** (${c.type}): ${c.description}`)
                .join('\n')
            : 'No contradictions found'
        msgs.push({
          id: `dialectical-contradiction-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'dialectical_contradiction',
          content: `**Contradictions Crystallized**\n\nFound **${details?.filteredContradictions ?? 0}** contradictions:\n\n${summary}`,
          author: 'Contradiction Tracker',
          metadata: details,
        })
      } else if (event.type === 'dialectical_synthesis' && event.output) {
        const details = event.details as Record<string, unknown> | undefined
        msgs.push({
          id: `dialectical-synthesis-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'dialectical_synthesis',
          content: event.output,
          author: event.agentName ?? 'Synthesis Agent',
          receiver: 'Sublation',
          metadata: details,
        })
      } else if (event.type === 'dialectical_meta' && event.output) {
        const details = event.details as Record<string, unknown> | undefined
        const decision = details?.decision ?? 'unknown'
        msgs.push({
          id: `dialectical-meta-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'dialectical_meta',
          content: `**Meta Decision: ${String(decision)}**\n\n${event.output}`,
          author: event.agentName ?? 'Meta Agent',
          metadata: details,
        })
      }
      // Error events
      else if (event.type === 'error') {
        msgs.push({
          id: `error-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'error',
          content: `**Error:** ${event.errorMessage ?? 'Unknown error'}${event.errorCategory ? `\n\nCategory: ${event.errorCategory}` : ''}`,
          author: event.agentName ?? 'System',
        })
      }
      // Agent messages or status updates with output
      else if (event.output) {
        msgs.push({
          id: `event-${idx}`,
          timestamp: event.timestampMs || fallbackTimestamp,
          type: 'agent_message',
          content: event.output,
          author: event.agentName ?? 'Agent',
          receiver: 'User',
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
          content: `**Tool Used:** ${event.toolName}\n\n${inputStr}`,
          author: event.agentName ?? 'Agent',
          receiver: event.toolName,
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
          content: `**Tool Result:** ${event.toolName}\n\n\`\`\`\n${resultStr}\n\`\`\``,
          author: event.toolName,
          receiver: event.agentName ?? 'Agent',
          metadata: { toolName: event.toolName },
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
        author: agentName ?? 'Agent',
        receiver: 'User',
      })
    }

    // Add live status message if running
    if (run.status === 'running') {
      const latestEvent = events[events.length - 1]
      let statusContent = 'Workflow is running...'

      // Check for recent tool calls
      const recentToolCall = events
        .slice(-5)
        .reverse()
        .find((e) => e.type === 'tool_call')
      if (recentToolCall && recentToolCall.toolName) {
        statusContent = `Using tool: **${recentToolCall.toolName}**`
      } else if (latestEvent?.agentName) {
        if (latestEvent.type === 'token') {
          statusContent = `**${latestEvent.agentName}** is thinking...`
        } else {
          statusContent = `**${latestEvent.agentName}** is working...`
        }
      } else if (run.workflowState?.currentNodeId && workflowGraph) {
        const currentNode = workflowGraph.nodes.find(
          (n) => n.id === run.workflowState?.currentNodeId
        )
        if (currentNode) {
          const nodeLabel = currentNode.label || currentNode.id
          if (currentNode.type === 'agent') {
            statusContent = `Agent: **${nodeLabel}**`
          } else if (currentNode.type === 'tool') {
            statusContent = `Tool: **${nodeLabel}**`
          } else if (currentNode.type === 'human_input') {
            statusContent = `Waiting for human input...`
          } else {
            statusContent = `Processing: **${nodeLabel}**`
          }
        }
      }

      msgs.push({
        id: 'live-status',
        timestamp: fallbackTimestamp,
        type: 'status',
        content: statusContent,
        author: 'System',
      })
    }

    // Append final output as the last slide
    if (finalOutput) {
      msgs.push({
        id: 'final-output',
        timestamp: run.completedAtMs ?? fallbackTimestamp,
        type: 'agent_message',
        content: finalOutput,
        author: 'Workflow',
        receiver: 'Final',
        tokensUsed: run.tokensUsed,
        estimatedCost: run.estimatedCost,
        metadata: { isFinalOutput: true },
      })
    }

    // Sort all messages by timestamp
    msgs.sort((a, b) => a.timestamp - b.timestamp)

    return msgs
  }, [events, messages, run, workflowGraph, pendingInput, agentName, finalOutput])

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

  // Combine all saveable messages into a single note
  const handleSaveAllAsNote = async () => {
    if (!onSaveAllAsNote) return

    // Filter out live-status and combine all messages
    const saveableMessages = carouselMessages.filter(
      (msg) => msg.id !== 'live-status' && msg.content
    )

    if (saveableMessages.length === 0) return

    // Format each message with header and content
    const combinedContent = saveableMessages
      .map((msg) => {
        const header = msg.author
          ? msg.receiver
            ? `### ${msg.author} → ${msg.receiver}`
            : `### ${msg.author}`
          : '### Message'

        const timestamp = new Date(msg.timestamp).toLocaleString()
        const meta = msg.tokensUsed ? ` (${msg.tokensUsed.toLocaleString()} tokens)` : ''

        return `${header}\n*${timestamp}*${meta}\n\n${msg.content}`
      })
      .join('\n\n---\n\n')

    // Add a title with run info
    const title = `# Run: ${run.goal.slice(0, 50)}${run.goal.length > 50 ? '...' : ''}\n\n`
    const runMeta = `**Status:** ${run.status} | **Messages:** ${saveableMessages.length}\n\n---\n\n`

    await onSaveAllAsNote(title + runMeta + combinedContent)
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

  const isRunning = run.status === 'running' || run.status === 'waiting_for_input'
  const isLiveView = isRunning && currentIndex === carouselMessages.length - 1
  const isQuestion = currentMessage?.type === 'question'
  const isFinalOutput = currentMessage?.metadata?.isFinalOutput === true

  return (
    <div className="message-carousel">
      <div className="carousel-header">
        <div className="carousel-title">
          {isQuestion ? (
            <span className="question-indicator">Agent Question</span>
          ) : isFinalOutput ? (
            <span>Final Output</span>
          ) : isLiveView ? (
            <span className="live-indicator">
              <span className="live-dot" />
              Live View
            </span>
          ) : isRunning ? (
            <span>Message History</span>
          ) : (
            <span>Run Messages</span>
          )}
        </div>
        <div className="carousel-header-actions">
          {onSaveAllAsNote && carouselMessages.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveAllAsNote}
              disabled={isSavingAll}
              className="add-all-button"
            >
              {isSavingAll ? 'Saving...' : 'Add All'}
            </Button>
          )}
          {onStop && run.status === 'running' && (
            <Button variant="ghost" size="sm" onClick={onStop} className="stop-button">
              Stop
            </Button>
          )}
        </div>
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

        <div className="carousel-content" data-message-type={currentMessage?.type}>
          {currentMessage ? (
            <>
              {/* Per-message top bar */}
              <div className="message-topbar">
                <div className="message-topbar-info">
                  {currentMessage.author && (
                    <span className="message-topbar-author">{currentMessage.author}</span>
                  )}
                  {currentMessage.receiver && (
                    <>
                      <span className="message-topbar-arrow">→</span>
                      <span className="message-topbar-receiver">{currentMessage.receiver}</span>
                    </>
                  )}
                  <span className="message-position">
                    {currentIndex + 1} / {carouselMessages.length}
                  </span>
                </div>
                <div className="message-topbar-actions">
                  {currentMessage.tokensUsed !== undefined && currentMessage.tokensUsed > 0 && (
                    <span className="message-topbar-metric">
                      {currentMessage.tokensUsed.toLocaleString()} tok
                    </span>
                  )}
                  {currentMessage.estimatedCost !== undefined &&
                    currentMessage.estimatedCost > 0 && (
                      <span className="message-topbar-metric">
                        ${currentMessage.estimatedCost.toFixed(4)}
                      </span>
                    )}
                  {onSaveAsNote && currentMessage.content && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="message-topbar-save"
                      onClick={() => void onSaveAsNote(currentMessage.content)}
                      disabled={isSavingNote}
                    >
                      {isSavingNote ? 'Saving...' : 'Save as Note'}
                    </Button>
                  )}
                </div>
              </div>

              <div className={`message-body ${isFinalOutput ? 'final-output-slide' : ''}`}>
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
