/**
 * AI Tools Panel Component
 *
 * Replaces AIAnalysisPanel with 6 AI-powered tools:
 * 1. Summarize - Condense note into key points
 * 2. Fact Check - Analyze claims for accuracy
 * 3. LinkedIn Analysis - Optimize for LinkedIn posts
 * 4. Write with AI - Generate content based on prompt
 * 5. Tag with AI - Auto-tag paragraphs semantically
 * 6. Note Tags - Manage note-level tags (merged from Tags button)
 */

import { useState, useCallback } from 'react'
import type { JSONContent } from '@tiptap/core'
import type { Note, TopicId } from '@lifeos/notes'
import { useNoteAITools, type AIToolType } from '@/hooks/useNoteAITools'
import { TagEditor } from './TagEditor'
import '@/styles/components/AIToolsPanel.css'

export interface AIToolsPanelProps {
  note: Note
  availableNotes: Note[]
  availableTopics: Array<{ topicId: TopicId; name: string }>
  onClose: () => void
  onTagsChange: (tags: string[]) => Promise<void>
  onContentInsert?: (text: string) => void
}

interface ToolButtonProps {
  icon: string
  label: string
  isActive: boolean
  isLoading: boolean
  onClick: () => void
}

function ToolButton({ icon, label, isActive, isLoading, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`ai-tools-panel__tool-btn ${isActive ? 'is-active' : ''}`}
      onClick={onClick}
      disabled={isLoading}
    >
      <span className="ai-tools-panel__tool-icon">{icon}</span>
      <span className="ai-tools-panel__tool-label">{label}</span>
      {isLoading && isActive && <span className="ai-tools-panel__spinner" />}
    </button>
  )
}

export function AIToolsPanel({
  note,
  availableNotes,
  availableTopics,
  onClose,
  onTagsChange,
  onContentInsert,
}: AIToolsPanelProps) {
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

  const [writePrompt, setWritePrompt] = useState('')

  const handleToolClick = useCallback(
    (tool: AIToolType) => {
      if (state.activeTool === tool) {
        // Toggle off
        setActiveTool(null)
        return
      }

      setActiveTool(tool)
      const content = note.content as JSONContent

      // Auto-run certain tools when selected
      switch (tool) {
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
        // writeWithAI needs user input first
      }
    },
    [
      state.activeTool,
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

  const handleInsertContent = useCallback(() => {
    if (state.writeResult && onContentInsert) {
      onContentInsert(state.writeResult)
      clearResults()
    }
  }, [state.writeResult, onContentInsert, clearResults])

  const handleCopyResult = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback
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

  const renderToolResult = () => {
    if (state.isLoading) {
      return (
        <div className="ai-tools-panel__loading">
          <div className="ai-tools-panel__loading-spinner" />
          <p>Analyzing...</p>
        </div>
      )
    }

    if (state.error) {
      return (
        <div className="ai-tools-panel__error">
          <p>{state.error}</p>
          <button
            type="button"
            className="ai-tools-panel__retry-btn"
            onClick={() => handleToolClick(state.activeTool)}
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
            <div className="ai-tools-panel__result">
              <h4>Summary</h4>
              <div className="ai-tools-panel__result-content">{state.summaryResult}</div>
              <div className="ai-tools-panel__result-actions">
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
            <div className="ai-tools-panel__result">
              <h4>Fact Check Results</h4>
              {state.factCheckResults.length === 0 ? (
                <p className="ai-tools-panel__empty-result">No factual claims identified.</p>
              ) : (
                <div className="ai-tools-panel__fact-list">
                  {state.factCheckResults.map((result, i) => (
                    <div
                      key={i}
                      className={`ai-tools-panel__fact-item confidence-${result.confidence}`}
                    >
                      <div className="ai-tools-panel__fact-claim">"{result.claim}"</div>
                      <div className="ai-tools-panel__fact-confidence">
                        Confidence: <span>{result.confidence}</span>
                      </div>
                      <div className="ai-tools-panel__fact-explanation">{result.explanation}</div>
                      {result.suggestedSources && result.suggestedSources.length > 0 && (
                        <div className="ai-tools-panel__fact-sources">
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
            <div className="ai-tools-panel__result">
              <h4>LinkedIn Analysis</h4>
              <div className="ai-tools-panel__linkedin-score">
                Score: <strong>{overallScore}/10</strong>
              </div>

              {hooks.length > 0 && (
                <div className="ai-tools-panel__linkedin-section">
                  <h5>Suggested Hooks</h5>
                  <ul>
                    {hooks.map((hook, i) => (
                      <li key={i}>{hook}</li>
                    ))}
                  </ul>
                </div>
              )}

              {suggestedHashtags.length > 0 && (
                <div className="ai-tools-panel__linkedin-section">
                  <h5>Hashtags</h5>
                  <div className="ai-tools-panel__hashtags">
                    {suggestedHashtags.map((tag, i) => (
                      <span key={i} className="ai-tools-panel__hashtag">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {quotableLines.length > 0 && (
                <div className="ai-tools-panel__linkedin-section">
                  <h5>Quotable Lines</h5>
                  <ul>
                    {quotableLines.map((line, i) => (
                      <li key={i}>"{line}"</li>
                    ))}
                  </ul>
                </div>
              )}

              {improvements.length > 0 && (
                <div className="ai-tools-panel__linkedin-section">
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
          <div className="ai-tools-panel__result">
            <h4>Write with AI</h4>
            <div className="ai-tools-panel__write-form">
              <textarea
                className="ai-tools-panel__write-input"
                value={writePrompt}
                onChange={(e) => setWritePrompt(e.target.value)}
                placeholder="Describe what you want to add... (e.g., 'Add a conclusion paragraph' or 'Expand on the second point with examples')"
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
              <div className="ai-tools-panel__write-result">
                <h5>Generated Content</h5>
                <div className="ai-tools-panel__result-content">{state.writeResult}</div>
                <div className="ai-tools-panel__result-actions">
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
            <div className="ai-tools-panel__result">
              <h4>Paragraph Tags</h4>
              {state.tagSuggestions.length === 0 ? (
                <p className="ai-tools-panel__empty-result">
                  No paragraphs found to tag. Add more content.
                </p>
              ) : (
                <div className="ai-tools-panel__tag-suggestions">
                  {state.tagSuggestions.map((suggestion, i) => (
                    <div key={i} className="ai-tools-panel__tag-suggestion">
                      <div className="ai-tools-panel__tag-paragraph">{suggestion.paragraphText}</div>
                      <div className="ai-tools-panel__tag-pills">
                        {suggestion.suggestedTags.map((tag, j) => (
                          <span key={j} className="ai-tools-panel__tag-pill freeform">
                            {tag}
                          </span>
                        ))}
                        {suggestion.matchedTopicIds.length > 0 && (
                          <span className="ai-tools-panel__tag-matched">
                            Matches: {suggestion.matchedTopicIds.length} topics
                          </span>
                        )}
                        {suggestion.matchedNoteIds.length > 0 && (
                          <span className="ai-tools-panel__tag-matched">
                            {suggestion.matchedNoteIds.length} notes
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
          <div className="ai-tools-panel__result">
            <h4>Note Tags</h4>
            <TagEditor tags={note.tags || []} onChange={onTagsChange} />
            {state.noteTagSuggestions && state.noteTagSuggestions.length > 0 && (
              <div className="ai-tools-panel__suggested-tags">
                <h5>AI Suggestions</h5>
                <div className="ai-tools-panel__suggestion-pills">
                  {state.noteTagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="ai-tools-panel__suggestion-pill"
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
        return (
          <div className="ai-tools-panel__placeholder">
            <p>Select a tool above to analyze or enhance your note.</p>
          </div>
        )
    }

    return null
  }

  return (
    <div className="ai-tools-panel">
      <div className="ai-tools-panel__header">
        <h3>AI Tools</h3>
        <button type="button" className="ai-tools-panel__close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="ai-tools-panel__tools">
        <ToolButton
          icon="📝"
          label="Summarize"
          isActive={state.activeTool === 'summarize'}
          isLoading={state.isLoading}
          onClick={() => handleToolClick('summarize')}
        />
        <ToolButton
          icon="✓"
          label="Fact Check"
          isActive={state.activeTool === 'factCheck'}
          isLoading={state.isLoading}
          onClick={() => handleToolClick('factCheck')}
        />
        <ToolButton
          icon="💼"
          label="LinkedIn"
          isActive={state.activeTool === 'linkedIn'}
          isLoading={state.isLoading}
          onClick={() => handleToolClick('linkedIn')}
        />
        <ToolButton
          icon="✨"
          label="Write"
          isActive={state.activeTool === 'writeWithAI'}
          isLoading={state.isLoading}
          onClick={() => handleToolClick('writeWithAI')}
        />
        <ToolButton
          icon="🏷"
          label="Auto-Tag"
          isActive={state.activeTool === 'tagWithAI'}
          isLoading={state.isLoading}
          onClick={() => handleToolClick('tagWithAI')}
        />
        <ToolButton
          icon="#"
          label="Tags"
          isActive={state.activeTool === 'noteTags'}
          isLoading={state.isLoading}
          onClick={() => handleToolClick('noteTags')}
        />
      </div>

      <div className="ai-tools-panel__content">{renderToolResult()}</div>
    </div>
  )
}
