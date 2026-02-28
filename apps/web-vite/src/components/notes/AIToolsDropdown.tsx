/**
 * AI Tools Dropdown Component
 *
 * A dropdown menu showing available AI tools with descriptions.
 * Selecting a tool triggers AI analysis and shows results in a modal.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { JSONContent } from '@tiptap/core'
import type { Note, TopicId } from '@lifeos/notes'
import { MODEL_PRICING } from '@lifeos/agents'
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
}

const AI_TOOLS: AITool[] = [
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Condense note into key points and themes',
  },
  {
    id: 'factCheck',
    name: 'Fact Check',
    description: 'Analyze claims for accuracy with sources',
  },
  {
    id: 'linkedIn',
    name: 'LinkedIn Analysis',
    description: 'Optimize content for LinkedIn engagement',
  },
  {
    id: 'writeWithAI',
    name: 'Write with AI',
    description: 'Generate new content based on a prompt',
  },
  {
    id: 'tagWithAI',
    name: 'Auto-Tag Paragraphs',
    description: 'Semantic paragraph-level tagging',
  },
  {
    id: 'noteTags',
    name: 'Manage Tags',
    description: 'Edit note tags with AI suggestions',
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
    runFactCheckExtract,
    toggleClaimSelection,
    runFactCheckVerify,
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
          void runFactCheckExtract(content)
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
      runFactCheckExtract,
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

  const selectedCount = state.selectedClaimFlags.filter(Boolean).length

  const renderFactCheckContent = () => {
    const { factCheckStep, extractedClaims, selectedClaimFlags, factCheckResults } = state

    // Extracting phase
    if (factCheckStep === 'extracting') {
      return (
        <div className="ai-dropdown-modal__loading">
          <div className="ai-dropdown-modal__spinner" />
          <p>Extracting claims...</p>
        </div>
      )
    }

    // Verifying phase
    if (factCheckStep === 'verifying') {
      return (
        <div className="ai-dropdown-modal__loading">
          <div className="ai-dropdown-modal__spinner" />
          <p>
            Verifying {selectedCount} claim{selectedCount !== 1 ? 's' : ''}...
          </p>
        </div>
      )
    }

    // Selection phase
    if (factCheckStep === 'selecting' && extractedClaims) {
      return (
        <div className="ai-dropdown-modal__result">
          <p className="ai-dropdown-modal__claim-select-header">
            Found {extractedClaims.length} claim{extractedClaims.length !== 1 ? 's' : ''} to verify.
            Uncheck any you trust.
          </p>
          {state.error && (
            <div className="ai-dropdown-modal__error" style={{ marginBottom: '0.75rem' }}>
              <p>{state.error}</p>
            </div>
          )}
          <div className="ai-dropdown-modal__claim-checkbox-list">
            {extractedClaims.map((claim, i) => (
              <label
                key={i}
                className={`ai-dropdown-modal__claim-checkbox-item ${selectedClaimFlags[i] ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  className="ai-dropdown-modal__claim-checkbox"
                  checked={selectedClaimFlags[i] ?? true}
                  onChange={() => toggleClaimSelection(i)}
                />
                <div className="ai-dropdown-modal__claim-content">
                  <div className="ai-dropdown-modal__claim-text">{claim.claim}</div>
                  <div className="ai-dropdown-modal__claim-meta">
                    <span
                      className={`ai-dropdown-modal__claim-confidence confidence-${claim.confidence}`}
                    >
                      {claim.confidence}
                    </span>
                  </div>
                  <div className="ai-dropdown-modal__claim-explanation">{claim.explanation}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="ai-dropdown-modal__claim-actions">
            <div className="ai-dropdown-modal__claim-bulk-actions">
              <button
                type="button"
                className="ghost-button small"
                onClick={() =>
                  extractedClaims.forEach((_, i) => {
                    if (!selectedClaimFlags[i]) toggleClaimSelection(i)
                  })
                }
              >
                Select All
              </button>
              <button
                type="button"
                className="ghost-button small"
                onClick={() =>
                  extractedClaims.forEach((_, i) => {
                    if (selectedClaimFlags[i]) toggleClaimSelection(i)
                  })
                }
              >
                Deselect All
              </button>
            </div>
            <button
              type="button"
              className="primary-button small"
              onClick={() => void runFactCheckVerify(note.content as JSONContent)}
            >
              {selectedCount === 0 ? 'Skip Verification' : `Verify Selected (${selectedCount})`}
            </button>
          </div>
        </div>
      )
    }

    // Done phase — grouped results
    if (factCheckStep === 'done' && factCheckResults) {
      if (factCheckResults.length === 0) {
        return (
          <div className="ai-dropdown-modal__result">
            <p className="ai-dropdown-modal__empty">No factual claims identified.</p>
          </div>
        )
      }

      const verified = factCheckResults.filter((r) => r.webSearchUsed !== false)
      const userConfirmed = factCheckResults.filter((r) => r.webSearchUsed === false)

      return (
        <div className="ai-dropdown-modal__result">
          <div className="ai-dropdown-modal__fact-list">
            {verified.length > 0 && (
              <>
                {userConfirmed.length > 0 && (
                  <div className="ai-dropdown-modal__results-group-header">Verified</div>
                )}
                {verified.map((result, i) => (
                  <div
                    key={`v-${i}`}
                    className={`ai-dropdown-modal__fact-item ${result.verdict ? `verdict-${result.verdict}` : `confidence-${result.confidence}`}`}
                  >
                    <div className="ai-dropdown-modal__fact-header">
                      <div className="ai-dropdown-modal__fact-claim">"{result.claim}"</div>
                      {result.verdict && (
                        <span
                          className={`ai-dropdown-modal__fact-verdict verdict-${result.verdict}`}
                        >
                          {result.verdict.replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="ai-dropdown-modal__fact-confidence">
                      Confidence: <span>{result.confidence}</span>
                    </div>
                    <div className="ai-dropdown-modal__fact-explanation">{result.explanation}</div>
                    {result.sources && result.sources.length > 0 && (
                      <div className="ai-dropdown-modal__fact-sources">
                        <strong>Sources:</strong>
                        <ul className="ai-dropdown-modal__source-list">
                          {result.sources.map((source, j) => (
                            <li
                              key={j}
                              className={source.supports ? 'source-supports' : 'source-contradicts'}
                            >
                              <a href={source.url} target="_blank" rel="noopener noreferrer">
                                {source.title}
                              </a>
                              <span className="ai-dropdown-modal__source-indicator">
                                {source.supports ? ' (supports)' : ' (contradicts)'}
                              </span>
                              {source.snippet && (
                                <p className="ai-dropdown-modal__source-snippet">
                                  {source.snippet}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!result.sources?.length &&
                      result.suggestedSources &&
                      result.suggestedSources.length > 0 && (
                        <div className="ai-dropdown-modal__fact-sources">
                          Verify with: {result.suggestedSources.join(', ')}
                        </div>
                      )}
                  </div>
                ))}
              </>
            )}
            {userConfirmed.length > 0 && (
              <>
                {verified.length > 0 && (
                  <div className="ai-dropdown-modal__results-group-header">User Confirmed</div>
                )}
                {userConfirmed.map((result, i) => (
                  <div
                    key={`uc-${i}`}
                    className="ai-dropdown-modal__fact-item verdict-user_confirmed"
                  >
                    <div className="ai-dropdown-modal__fact-header">
                      <div className="ai-dropdown-modal__fact-claim">"{result.claim}"</div>
                      <span className="ai-dropdown-modal__fact-verdict verdict-user_confirmed">
                        user confirmed
                      </span>
                    </div>
                    <div className="ai-dropdown-modal__fact-confidence">
                      Confidence: <span>{result.confidence}</span>
                    </div>
                    <div className="ai-dropdown-modal__fact-explanation">{result.explanation}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )
    }

    return null
  }

  const renderModalContent = () => {
    // For factCheck, delegate to step-aware renderer
    if (state.activeTool === 'factCheck') {
      return renderFactCheckContent()
    }

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

      case 'linkedIn':
        if (state.linkedInResult) {
          const {
            overallScore,
            hooks,
            suggestedHashtags,
            quotableLines,
            improvements,
            trendingContext,
            timingAdvice,
            competitiveAnalysis,
            webSearchUsed,
          } = state.linkedInResult
          return (
            <div className="ai-dropdown-modal__result">
              <div className="ai-dropdown-modal__linkedin-score">
                Score: <strong>{overallScore}/10</strong>
                {webSearchUsed && (
                  <span
                    className="ai-dropdown-modal__web-badge ai-dropdown-modal__web-badge--verified"
                    style={{ marginLeft: 8, fontSize: '0.75rem' }}
                  >
                    Trend data included
                  </span>
                )}
              </div>

              {trendingContext && (
                <div className="ai-dropdown-modal__section ai-dropdown-modal__trending">
                  <h5>Topic Trending Analysis</h5>
                  <div className="ai-dropdown-modal__trend-header">
                    <span
                      className={`ai-dropdown-modal__trend-badge ${trendingContext.isTrending ? 'trending' : 'not-trending'}`}
                    >
                      {trendingContext.isTrending ? 'Trending' : 'Not trending'}
                    </span>
                    <span className="ai-dropdown-modal__trend-score">
                      Trend score: <strong>{trendingContext.trendScore}/10</strong>
                    </span>
                  </div>
                  {trendingContext.relatedNews.length > 0 && (
                    <div className="ai-dropdown-modal__trend-section">
                      <strong>Related News:</strong>
                      <ul>
                        {trendingContext.relatedNews.slice(0, 3).map((news, i) => (
                          <li key={i}>
                            <a href={news.url} target="_blank" rel="noopener noreferrer">
                              {news.title}
                            </a>
                            {news.date && (
                              <span className="ai-dropdown-modal__trend-date"> ({news.date})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {trendingContext.relatedPosts.length > 0 && (
                    <div className="ai-dropdown-modal__trend-section">
                      <strong>Similar LinkedIn Posts:</strong>
                      <ul>
                        {trendingContext.relatedPosts.slice(0, 3).map((post, i) => (
                          <li key={i}>
                            <a href={post.url} target="_blank" rel="noopener noreferrer">
                              {post.title}
                            </a>
                            {post.snippet && (
                              <p className="ai-dropdown-modal__source-snippet">{post.snippet}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {timingAdvice && (
                <div className="ai-dropdown-modal__section">
                  <h5>Timing Advice</h5>
                  <p>{timingAdvice}</p>
                </div>
              )}

              {competitiveAnalysis && (
                <div className="ai-dropdown-modal__section">
                  <h5>Competitive Analysis</h5>
                  <p>{competitiveAnalysis}</p>
                </div>
              )}

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
              <div className="ai-dropdown-modal__write-actions">
                <button
                  type="button"
                  className="primary-button small"
                  onClick={handleWriteSubmit}
                  disabled={!writePrompt.trim() || state.isLoading}
                >
                  {state.writeResult ? 'Re-run' : 'Generate'}
                </button>
              </div>
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
                    <>
                      <button
                        type="button"
                        className="primary-button small"
                        onClick={handleInsertContent}
                      >
                        Append to Note
                      </button>
                    </>
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
          aria-haspopup="true"
        >
          AI Tools
          <span className="ai-tools-dropdown__caret">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div className="ai-tools-dropdown__menu" role="menu">
            {AI_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                role="menuitem"
                className="ai-tools-dropdown__item"
                onClick={() => handleToolSelect(tool.id)}
              >
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
              <button type="button" className="ai-dropdown-modal__close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <div className="ai-dropdown-modal__body">{renderModalContent()}</div>
            {(() => {
              const displayUsage =
                state.usage ?? (state.factCheckStep === 'selecting' ? state.extractionUsage : null)
              if (!displayUsage || state.isLoading) return null
              return (
                <div className="ai-dropdown-modal__footer">
                  <span className="ai-dropdown-modal__usage">
                    {displayUsage.inputTokens.toLocaleString()} input +{' '}
                    {displayUsage.outputTokens.toLocaleString()} output tokens
                  </span>
                  <span className="ai-dropdown-modal__cost">
                    {formatCost(calculateCost(displayUsage.inputTokens, displayUsage.outputTokens))}
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </>
  )
}
