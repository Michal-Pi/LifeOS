/**
 * AI Tools Dropdown Component
 *
 * A dropdown menu showing available AI tools with descriptions.
 * Selecting a tool triggers AI analysis and shows results in a modal.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { JSONContent } from '@tiptap/core'
import type { Note, TopicId } from '@lifeos/notes'
import { useNoteAITools, type AIToolType } from '@/hooks/useNoteAITools'
import { TagEditor } from './TagEditor'
import '@/styles/components/AIToolsDropdown.css'

export interface AIToolsDropdownProps {
  note: Note
  availableNotes: Note[]
  availableTopics: Array<{ topicId: TopicId; name: string }>
  onTagsChange: (tags: string[]) => Promise<void>
  onContentInsert?: (text: string) => void
}

interface AITool {
  id: AIToolType
  name: string
  description: string
  icon: string
}

const AI_TOOLS: AITool[] = [
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Condense note into key points and themes',
    icon: '📝',
  },
  {
    id: 'factCheck',
    name: 'Fact Check',
    description: 'Analyze claims for accuracy with sources',
    icon: '✓',
  },
  {
    id: 'linkedIn',
    name: 'LinkedIn Analysis',
    description: 'Optimize content for LinkedIn engagement',
    icon: '💼',
  },
  {
    id: 'writeWithAI',
    name: 'Write with AI',
    description: 'Generate new content based on a prompt',
    icon: '✨',
  },
  {
    id: 'tagWithAI',
    name: 'Auto-Tag Paragraphs',
    description: 'Semantic paragraph-level tagging',
    icon: '🏷',
  },
  {
    id: 'noteTags',
    name: 'Manage Tags',
    description: 'Edit note tags with AI suggestions',
    icon: '#',
  },
]

export function AIToolsDropdown({
  note,
  availableNotes,
  availableTopics,
  onTagsChange,
  onContentInsert,
}: AIToolsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [writePrompt, setWritePrompt] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    state,
    runSummarize,
    runFactCheck,
    runLinkedIn,
    runWriteWithAI,
    runTagWithAI,
    runSuggestNoteTags,
    setActiveTool,
    clearResults,
  } = useNoteAITools()

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
    (toolId: AIToolType) => {
      setIsOpen(false)
      setActiveTool(toolId)
      setShowModal(true)

      const content = note.content as JSONContent

      // Run the selected tool
      switch (toolId) {
        case 'summarize':
          void runSummarize(content)
          break
        case 'factCheck':
          void runFactCheck(content)
          break
        case 'linkedIn':
          void runLinkedIn(content)
          break
        case 'tagWithAI':
          void runTagWithAI(
            content,
            availableTopics.map((t) => ({ id: t.topicId, name: t.name })),
            availableNotes.map((n) => ({ id: n.noteId, title: n.title }))
          )
          break
        case 'noteTags':
          void runSuggestNoteTags(content, note.tags || [])
          break
        case 'writeWithAI':
          // Don't run immediately, wait for prompt
          break
      }
    },
    [
      note,
      availableTopics,
      availableNotes,
      setActiveTool,
      runSummarize,
      runFactCheck,
      runLinkedIn,
      runTagWithAI,
      runSuggestNoteTags,
    ]
  )

  const handleWriteSubmit = useCallback(() => {
    if (!writePrompt.trim()) return
    const content = note.content as JSONContent
    void runWriteWithAI(content, writePrompt)
  }, [note, writePrompt, runWriteWithAI])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setActiveTool(null)
    clearResults()
    setWritePrompt('')
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

  const handleInsertContent = useCallback(() => {
    if (state.writeResult && onContentInsert) {
      onContentInsert(state.writeResult)
      handleCloseModal()
    }
  }, [state.writeResult, onContentInsert, handleCloseModal])

  const getToolName = (toolId: AIToolType): string => {
    return AI_TOOLS.find((t) => t.id === toolId)?.name || 'AI Tool'
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
            onClick={() => handleToolSelect(state.activeTool!)}
          >
            Retry
          </button>
        </div>
      )
    }

    switch (state.activeTool) {
      case 'summarize':
        if (state.summaryResult) {
          return (
            <div className="ai-dropdown-modal__result">
              <div className="ai-dropdown-modal__content">{state.summaryResult}</div>
              <div className="ai-dropdown-modal__actions">
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={() => handleCopyResult(state.summaryResult!)}
                >
                  Copy
                </button>
              </div>
            </div>
          )
        }
        break

      case 'factCheck':
        if (state.factCheckResults) {
          return (
            <div className="ai-dropdown-modal__result">
              {state.factCheckResults.length === 0 ? (
                <p className="ai-dropdown-modal__empty">No factual claims identified.</p>
              ) : (
                <div className="ai-dropdown-modal__fact-list">
                  {state.factCheckResults.map((result, i) => (
                    <div
                      key={i}
                      className={`ai-dropdown-modal__fact-item confidence-${result.confidence}`}
                    >
                      <div className="ai-dropdown-modal__fact-claim">"{result.claim}"</div>
                      <div className="ai-dropdown-modal__fact-confidence">
                        Confidence: <span>{result.confidence}</span>
                      </div>
                      <div className="ai-dropdown-modal__fact-explanation">{result.explanation}</div>
                      {result.suggestedSources && result.suggestedSources.length > 0 && (
                        <div className="ai-dropdown-modal__fact-sources">
                          Verify with: {result.suggestedSources.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }
        break

      case 'linkedIn':
        if (state.linkedInResult) {
          const { overallScore, hooks, suggestedHashtags, quotableLines, improvements } =
            state.linkedInResult
          return (
            <div className="ai-dropdown-modal__result">
              <div className="ai-dropdown-modal__linkedin-score">
                Score: <strong>{overallScore}/10</strong>
              </div>

              {hooks.length > 0 && (
                <div className="ai-dropdown-modal__section">
                  <h5>Suggested Hooks</h5>
                  <ul>
                    {hooks.map((hook, i) => (
                      <li key={i}>{hook}</li>
                    ))}
                  </ul>
                </div>
              )}

              {suggestedHashtags.length > 0 && (
                <div className="ai-dropdown-modal__section">
                  <h5>Hashtags</h5>
                  <div className="ai-dropdown-modal__hashtags">
                    {suggestedHashtags.map((tag, i) => (
                      <span key={i} className="ai-dropdown-modal__hashtag">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {quotableLines.length > 0 && (
                <div className="ai-dropdown-modal__section">
                  <h5>Quotable Lines</h5>
                  <ul>
                    {quotableLines.map((line, i) => (
                      <li key={i}>"{line}"</li>
                    ))}
                  </ul>
                </div>
              )}

              {improvements.length > 0 && (
                <div className="ai-dropdown-modal__section">
                  <h5>Improvements</h5>
                  <ul>
                    {improvements.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        }
        break

      case 'writeWithAI':
        return (
          <div className="ai-dropdown-modal__result">
            <div className="ai-dropdown-modal__write-form">
              <textarea
                className="ai-dropdown-modal__write-input"
                value={writePrompt}
                onChange={(e) => setWritePrompt(e.target.value)}
                placeholder="Describe what you want to add... (e.g., 'Add a conclusion' or 'Expand on the second point')"
                rows={3}
              />
              <button
                type="button"
                className="primary-button small"
                onClick={handleWriteSubmit}
                disabled={!writePrompt.trim() || state.isLoading}
              >
                Generate
              </button>
            </div>
            {state.writeResult && (
              <div className="ai-dropdown-modal__write-result">
                <h5>Generated Content</h5>
                <div className="ai-dropdown-modal__content">{state.writeResult}</div>
                <div className="ai-dropdown-modal__actions">
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() => handleCopyResult(state.writeResult!)}
                  >
                    Copy
                  </button>
                  {onContentInsert && (
                    <button
                      type="button"
                      className="primary-button small"
                      onClick={handleInsertContent}
                    >
                      Insert at End
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )

      case 'tagWithAI':
        if (state.tagSuggestions) {
          return (
            <div className="ai-dropdown-modal__result">
              {state.tagSuggestions.length === 0 ? (
                <p className="ai-dropdown-modal__empty">No paragraphs found to tag.</p>
              ) : (
                <div className="ai-dropdown-modal__tag-suggestions">
                  {state.tagSuggestions.map((suggestion, i) => (
                    <div key={i} className="ai-dropdown-modal__tag-item">
                      <div className="ai-dropdown-modal__tag-paragraph">
                        {suggestion.paragraphText}
                      </div>
                      <div className="ai-dropdown-modal__tag-pills">
                        {suggestion.suggestedTags.map((tag, j) => (
                          <span key={j} className="ai-dropdown-modal__tag-pill">
                            {tag}
                          </span>
                        ))}
                        {suggestion.matchedTopicIds.length > 0 && (
                          <span className="ai-dropdown-modal__tag-matched">
                            +{suggestion.matchedTopicIds.length} topics
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }
        break

      case 'noteTags':
        return (
          <div className="ai-dropdown-modal__result">
            <TagEditor tags={note.tags || []} onChange={onTagsChange} />
            {state.noteTagSuggestions && state.noteTagSuggestions.length > 0 && (
              <div className="ai-dropdown-modal__suggested-tags">
                <h5>AI Suggestions</h5>
                <div className="ai-dropdown-modal__suggestion-pills">
                  {state.noteTagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="ai-dropdown-modal__suggestion-pill"
                      onClick={() => {
                        const currentTags = note.tags || []
                        if (!currentTags.includes(tag)) {
                          void onTagsChange([...currentTags, tag])
                        }
                      }}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )

      default:
        return null
    }

    return null
  }

  return (
    <>
      <div className="ai-tools-dropdown" ref={dropdownRef}>
        <button
          type="button"
          className="ghost-button notes-header-button ai-tools-dropdown__trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          AI Tools
          <span className="ai-tools-dropdown__caret">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div className="ai-tools-dropdown__menu">
            {AI_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="ai-tools-dropdown__item"
                onClick={() => handleToolSelect(tool.id)}
              >
                <span className="ai-tools-dropdown__item-icon">{tool.icon}</span>
                <div className="ai-tools-dropdown__item-content">
                  <span className="ai-tools-dropdown__item-name">{tool.name}</span>
                  <span className="ai-tools-dropdown__item-desc">{tool.description}</span>
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
              <button
                type="button"
                className="ai-dropdown-modal__close"
                onClick={handleCloseModal}
              >
                ×
              </button>
            </div>
            <div className="ai-dropdown-modal__body">{renderModalContent()}</div>
          </div>
        </div>
      )}
    </>
  )
}
