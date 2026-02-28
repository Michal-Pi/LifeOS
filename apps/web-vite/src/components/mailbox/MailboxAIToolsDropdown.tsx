/**
 * Mailbox AI Tools Dropdown Component
 *
 * A dropdown menu showing available mailbox AI tools with descriptions.
 * Selecting a tool triggers AI analysis and shows results in a modal.
 * Follows the same pattern as AIToolsDropdown.tsx.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { MessageSource, SenderPersona, CleanupRecommendation } from '@lifeos/agents'
import { MODEL_PRICING } from '@lifeos/agents'
import { useMailboxAITools, type MailboxAIToolType } from '@/hooks/useMailboxAITools'
import '@/styles/components/MailboxAIToolsDropdown.css'

export interface MailboxAIToolsDropdownProps {
  /** Currently selected message context for Response Draft */
  selectedMessage?: {
    messageId: string
    messageBody: string
    senderName: string
    source: MessageSource
    senderPersona?: Partial<SenderPersona>
  }
  /** Messages for bulk cleanup */
  messages?: Array<{
    id: string
    source: MessageSource
    sender: string
    subject?: string
    snippet: string
    priority?: string
  }>
  /** Callback when a draft is generated (e.g., insert into composer) */
  onDraftInsert?: (body: string, subject?: string) => void
  /** Callback when cleanup actions are confirmed */
  onCleanupApply?: (actions: CleanupRecommendation[]) => void
}

interface MailboxAITool {
  id: MailboxAIToolType
  name: string
  description: string
}

const MAILBOX_AI_TOOLS: MailboxAITool[] = [
  {
    id: 'responseDraft',
    name: 'Response Draft',
    description: 'Generate a reply matching sender tone',
  },
  {
    id: 'mailboxCleanup',
    name: 'Mailbox Cleanup',
    description: 'Recommend archive, snooze, or unsubscribe actions',
  },
  {
    id: 'senderResearch',
    name: 'Sender Research',
    description: 'Build a detailed sender persona profile',
  },
]

function calculateCost(inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING.default
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

function formatCost(cost: number): string {
  if (cost < 0.001) return '<$0.001'
  return `$${cost.toFixed(4)}`
}

export function MailboxAIToolsDropdown({
  selectedMessage,
  messages,
  onDraftInsert,
  onCleanupApply,
}: MailboxAIToolsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [senderNameInput, setSenderNameInput] = useState('')
  const [senderEmailInput, setSenderEmailInput] = useState('')
  const [selectedCleanupActions, setSelectedCleanupActions] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    state,
    runResponseDraft,
    runMailboxCleanup,
    runSenderResearch,
    setActiveTool,
    clearResults,
  } = useMailboxAITools()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleToolSelect = useCallback(
    (toolId: MailboxAIToolType) => {
      setIsOpen(false)
      setActiveTool(toolId)
      setShowModal(true)

      switch (toolId) {
        case 'responseDraft':
          if (selectedMessage) {
            void runResponseDraft(
              selectedMessage.messageId,
              selectedMessage.messageBody,
              selectedMessage.senderName,
              {
                senderPersona: selectedMessage.senderPersona,
                messageSource: selectedMessage.source,
              }
            )
          }
          break
        case 'mailboxCleanup':
          if (messages && messages.length > 0) {
            void runMailboxCleanup(messages)
          }
          break
        case 'senderResearch':
          // Don't run immediately, wait for user input
          if (selectedMessage) {
            setSenderNameInput(selectedMessage.senderName)
          }
          break
      }
    },
    [selectedMessage, messages, setActiveTool, runResponseDraft, runMailboxCleanup]
  )

  const handleSenderResearchSubmit = useCallback(() => {
    if (!senderNameInput.trim()) return
    void runSenderResearch(senderNameInput, senderEmailInput || undefined)
  }, [senderNameInput, senderEmailInput, runSenderResearch])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setActiveTool(null)
    clearResults()
    setSenderNameInput('')
    setSenderEmailInput('')
    setSelectedCleanupActions(new Set())
  }, [setActiveTool, clearResults])

  const handleCopyResult = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }, [])

  const handleInsertDraft = useCallback(() => {
    if (state.draftResult && onDraftInsert) {
      onDraftInsert(state.draftResult.body, state.draftResult.subject)
      handleCloseModal()
    }
  }, [state.draftResult, onDraftInsert, handleCloseModal])

  const handleApplyCleanup = useCallback(() => {
    if (state.cleanupResult && onCleanupApply) {
      const selected = state.cleanupResult.filter((r) => selectedCleanupActions.has(r.messageId))
      onCleanupApply(selected)
      handleCloseModal()
    }
  }, [state.cleanupResult, selectedCleanupActions, onCleanupApply, handleCloseModal])

  const toggleCleanupAction = useCallback((messageId: string) => {
    setSelectedCleanupActions((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }, [])

  const getToolName = (toolId: MailboxAIToolType): string => {
    return MAILBOX_AI_TOOLS.find((t) => t.id === toolId)?.name || 'Mailbox AI Tool'
  }

  const getActionLabel = (action: string): string => {
    switch (action) {
      case 'archive':
        return 'Archive'
      case 'snooze':
        return 'Snooze'
      case 'unsubscribe':
        return 'Unsubscribe'
      case 'keep':
        return 'Keep'
      default:
        return action
    }
  }

  const getActionClass = (action: string): string => {
    switch (action) {
      case 'archive':
        return 'action-archive'
      case 'snooze':
        return 'action-snooze'
      case 'unsubscribe':
        return 'action-unsubscribe'
      case 'keep':
        return 'action-keep'
      default:
        return ''
    }
  }

  const renderModalContent = () => {
    if (state.isLoading) {
      return (
        <div className="ai-dropdown-modal__loading">
          <div className="ai-dropdown-modal__spinner" />
          <p>Analyzing...</p>
        </div>
      )
    }

    if (state.error) {
      return (
        <div className="ai-dropdown-modal__error">
          <p>{state.error}</p>
          <button
            type="button"
            className="ghost-button small"
            onClick={() => {
              if (state.activeTool) handleToolSelect(state.activeTool)
            }}
          >
            Retry
          </button>
        </div>
      )
    }

    switch (state.activeTool) {
      case 'responseDraft':
        if (!selectedMessage && !state.draftResult) {
          return (
            <div className="ai-dropdown-modal__empty">
              Select a message to generate a response draft.
            </div>
          )
        }
        if (state.draftResult) {
          return (
            <div className="ai-dropdown-modal__result">
              {state.draftResult.subject && (
                <div className="mailbox-ai__draft-subject">
                  <strong>Subject:</strong> {state.draftResult.subject}
                </div>
              )}
              <div className="mailbox-ai__draft-body">
                <div className="ai-dropdown-modal__content">{state.draftResult.body}</div>
              </div>
              <div className="mailbox-ai__draft-tone">
                Tone: <span className="mailbox-ai__tone-badge">{state.draftResult.tone}</span>
              </div>
              {state.draftResult.alternateVersions &&
                state.draftResult.alternateVersions.length > 0 && (
                  <div className="mailbox-ai__alternates">
                    <h5>Alternate Versions</h5>
                    {state.draftResult.alternateVersions.map((alt, i) => (
                      <div key={i} className="mailbox-ai__alternate-item">
                        <div className="ai-dropdown-modal__content">{alt}</div>
                        <button
                          type="button"
                          className="ghost-button small"
                          onClick={() => handleCopyResult(alt)}
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              <div className="ai-dropdown-modal__actions">
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={() => handleCopyResult(state.draftResult!.body)}
                >
                  Copy
                </button>
                {onDraftInsert && (
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={handleInsertDraft}
                  >
                    Insert into Composer
                  </button>
                )}
              </div>
            </div>
          )
        }
        break

      case 'mailboxCleanup':
        if (!messages || messages.length === 0) {
          return (
            <div className="ai-dropdown-modal__empty">
              No messages available for cleanup analysis.
            </div>
          )
        }
        if (state.cleanupResult) {
          if (state.cleanupResult.length === 0) {
            return (
              <div className="ai-dropdown-modal__empty">No cleanup recommendations generated.</div>
            )
          }
          return (
            <div className="ai-dropdown-modal__result">
              <div className="mailbox-ai__cleanup-list">
                {state.cleanupResult.map((rec) => (
                  <label
                    key={rec.messageId}
                    className={`mailbox-ai__cleanup-item ${selectedCleanupActions.has(rec.messageId) ? 'is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mailbox-ai__cleanup-checkbox"
                      checked={selectedCleanupActions.has(rec.messageId)}
                      onChange={() => toggleCleanupAction(rec.messageId)}
                    />
                    <div className="mailbox-ai__cleanup-content">
                      <div className="mailbox-ai__cleanup-header">
                        <span
                          className={`mailbox-ai__cleanup-action ${getActionClass(rec.action)}`}
                        >
                          {getActionLabel(rec.action)}
                        </span>
                        <span className="mailbox-ai__cleanup-message-id">
                          {messages?.find((m) => m.id === rec.messageId)?.sender || rec.messageId}
                        </span>
                      </div>
                      <div className="mailbox-ai__cleanup-reason">{rec.reason}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="mailbox-ai__cleanup-actions">
                <div className="mailbox-ai__cleanup-bulk">
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() => {
                      const all = new Set(state.cleanupResult!.map((r) => r.messageId))
                      setSelectedCleanupActions(all)
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() => setSelectedCleanupActions(new Set())}
                  >
                    Deselect All
                  </button>
                </div>
                {onCleanupApply && (
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={handleApplyCleanup}
                    disabled={selectedCleanupActions.size === 0}
                  >
                    Apply Selected ({selectedCleanupActions.size})
                  </button>
                )}
              </div>
            </div>
          )
        }
        break

      case 'senderResearch':
        if (!state.researchResult) {
          return (
            <div className="ai-dropdown-modal__result">
              <div className="mailbox-ai__research-form">
                <div className="mailbox-ai__research-field">
                  <label>Sender Name</label>
                  <input
                    type="text"
                    value={senderNameInput}
                    onChange={(e) => setSenderNameInput(e.target.value)}
                    placeholder="e.g., Jane Smith"
                  />
                </div>
                <div className="mailbox-ai__research-field">
                  <label>Email (optional)</label>
                  <input
                    type="email"
                    value={senderEmailInput}
                    onChange={(e) => setSenderEmailInput(e.target.value)}
                    placeholder="e.g., jane@example.com"
                  />
                </div>
                <div className="ai-dropdown-modal__actions">
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={handleSenderResearchSubmit}
                    disabled={!senderNameInput.trim() || state.isLoading}
                  >
                    Research
                  </button>
                </div>
              </div>
            </div>
          )
        }

        return (
          <div className="ai-dropdown-modal__result">
            <div className="mailbox-ai__persona-card">
              <div className="mailbox-ai__persona-header">
                <h4>{state.researchResult.name}</h4>
                {state.researchResult.title && (
                  <span className="mailbox-ai__persona-title">
                    {state.researchResult.title}
                    {state.researchResult.company && ` at ${state.researchResult.company}`}
                  </span>
                )}
              </div>

              {state.researchResult.bio && (
                <p className="mailbox-ai__persona-bio">{state.researchResult.bio}</p>
              )}

              {state.researchResult.communicationStyle && (
                <div className="mailbox-ai__persona-section">
                  <h5>Communication Style</h5>
                  <p>{state.researchResult.communicationStyle}</p>
                </div>
              )}

              {state.researchResult.languageProfile && (
                <div className="mailbox-ai__persona-section">
                  <h5>Language Profile</h5>
                  <div className="mailbox-ai__persona-badges">
                    <span className="mailbox-ai__persona-badge">
                      {state.researchResult.languageProfile.formalityLevel}
                    </span>
                    <span className="mailbox-ai__persona-badge">
                      {state.researchResult.languageProfile.vocabularyComplexity}
                    </span>
                    {state.researchResult.languageProfile.speakingStyle && (
                      <span className="mailbox-ai__persona-badge">
                        {state.researchResult.languageProfile.speakingStyle}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {state.researchResult.topTopics && state.researchResult.topTopics.length > 0 && (
                <div className="mailbox-ai__persona-section">
                  <h5>Top Topics</h5>
                  <div className="mailbox-ai__persona-pills">
                    {state.researchResult.topTopics.map((topic, i) => (
                      <span key={i} className="mailbox-ai__persona-pill">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {state.researchResult.keyInterests &&
                state.researchResult.keyInterests.length > 0 && (
                  <div className="mailbox-ai__persona-section">
                    <h5>Key Interests</h5>
                    <div className="mailbox-ai__persona-pills">
                      {state.researchResult.keyInterests.map((interest, i) => (
                        <span key={i} className="mailbox-ai__persona-pill">
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {state.researchResult.suggestedTalkingPoints &&
                state.researchResult.suggestedTalkingPoints.length > 0 && (
                  <div className="mailbox-ai__persona-section">
                    <h5>Suggested Talking Points</h5>
                    <ul>
                      {state.researchResult.suggestedTalkingPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {state.researchResult.recentActivity && (
                <div className="mailbox-ai__persona-section">
                  <h5>Recent Activity</h5>
                  <p>{state.researchResult.recentActivity}</p>
                </div>
              )}
            </div>
          </div>
        )

      default:
        return null
    }

    return null
  }

  return (
    <>
      <div className="mailbox-ai-tools-dropdown" ref={dropdownRef}>
        <button
          type="button"
          className="ghost-button mailbox-ai-tools-dropdown__trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          AI Tools
          <span className="mailbox-ai-tools-dropdown__caret">{isOpen ? '\u25B2' : '\u25BC'}</span>
        </button>

        {isOpen && (
          <div className="mailbox-ai-tools-dropdown__menu" role="menu">
            {MAILBOX_AI_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                role="menuitem"
                className="mailbox-ai-tools-dropdown__item"
                onClick={() => handleToolSelect(tool.id)}
              >
                <div className="mailbox-ai-tools-dropdown__item-content">
                  <span className="mailbox-ai-tools-dropdown__item-name">{tool.name}</span>
                  <span className="mailbox-ai-tools-dropdown__item-desc">{tool.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results Modal */}
      {showModal && (
        <div className="ai-dropdown-modal__overlay" onClick={handleCloseModal}>
          <div className="ai-dropdown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-dropdown-modal__header">
              <h3>{getToolName(state.activeTool)}</h3>
              <button type="button" className="ai-dropdown-modal__close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <div className="ai-dropdown-modal__body">{renderModalContent()}</div>
            {state.usage && !state.isLoading && (
              <div className="ai-dropdown-modal__footer">
                <span className="ai-dropdown-modal__usage">
                  {state.usage.inputTokens.toLocaleString()} input +{' '}
                  {state.usage.outputTokens.toLocaleString()} output tokens
                </span>
                <span className="ai-dropdown-modal__cost">
                  {formatCost(calculateCost(state.usage.inputTokens, state.usage.outputTokens))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
