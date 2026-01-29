/**
 * AgentQuestionPanel Component
 *
 * Displays agent questions during workflow execution when run is waiting for user input.
 * Features:
 * - Prominent design with accent color highlighting
 * - Basic text formatting support
 * - Keyboard shortcuts (Cmd/Ctrl+Enter to submit)
 * - Character count indicator
 * - Loading state during submission
 */

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface AgentQuestionPanelProps {
  pendingInput: { prompt: string; nodeId: string }
  agentName?: string
  onSubmit: (response: string) => Promise<void>
  isSubmitting: boolean
}

/**
 * Simple component to format agent questions with basic styling
 * Handles numbered lists, bold text, and line breaks without external dependencies
 */
function FormattedPrompt({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div>
      {lines.map((line, idx) => {
        const trimmed = line.trim()

        // Handle numbered lists (e.g., "1. ", "2. ")
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
        if (numberedMatch) {
          const [, number, content] = numberedMatch
          return (
            <div key={idx} style={{ marginBottom: '8px', paddingLeft: '16px' }}>
              <strong>{number}.</strong> {formatInlineText(content)}
            </div>
          )
        }

        // Handle bullet points (e.g., "- ", "* ")
        const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/)
        if (bulletMatch) {
          const [, content] = bulletMatch
          return (
            <div key={idx} style={{ marginBottom: '8px', paddingLeft: '16px' }}>
              • {formatInlineText(content)}
            </div>
          )
        }

        // Empty lines
        if (!trimmed) {
          return <div key={idx} style={{ height: '8px' }} />
        }

        // Regular paragraphs
        return (
          <p key={idx} style={{ margin: '0 0 8px 0' }}>
            {formatInlineText(trimmed)}
          </p>
        )
      })}
    </div>
  )
}

/**
 * Format inline text with bold markers (**text**)
 */
function formatInlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)

  return parts.map((part, idx) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/)
    if (boldMatch) {
      return <strong key={idx}>{boldMatch[1]}</strong>
    }
    return <span key={idx}>{part}</span>
  })
}

export function AgentQuestionPanel({
  pendingInput,
  agentName,
  onSubmit,
  isSubmitting,
}: AgentQuestionPanelProps) {
  const [response, setResponse] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [pendingInput.nodeId])

  const handleSubmit = async () => {
    const trimmed = response.trim()
    if (!trimmed || isSubmitting) return

    await onSubmit(trimmed)
    setResponse('')
  }

  const handleSkip = async () => {
    if (isSubmitting) return
    await onSubmit('')
    setResponse('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const charCount = response.length
  const hasContent = response.trim().length > 0

  return (
    <div className="agent-question-panel">
      <div className="agent-question-header">
        <div className="agent-question-icon">❓</div>
        <div>
          <h4>{agentName || 'Agent'} has a question</h4>
          <span className="agent-question-subtitle">Response required to continue</span>
        </div>
      </div>

      <div className="agent-question-prompt">
        <FormattedPrompt text={pendingInput.prompt} />
      </div>

      <textarea
        ref={textareaRef}
        className="agent-question-textarea"
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your response here... (Cmd/Ctrl+Enter to submit)"
        disabled={isSubmitting}
        rows={4}
      />

      <div className="agent-question-footer">
        <div className="agent-question-meta">
          {charCount > 0 && <span>{charCount} characters</span>}
          {!isSubmitting && <span className="keyboard-hint">⌘↵ to submit</span>}
        </div>

        <div className="agent-question-actions">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={isSubmitting}>
            Skip
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!hasContent || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Response'}
          </Button>
        </div>
      </div>
    </div>
  )
}
