/**
 * AI Analysis Panel Component
 *
 * Shows AI-identified paragraphs/ideas and allows tagging them.
 */

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createFirestoreNoteRepository } from '@/adapters/notes/firestoreNoteRepository'
import type { Note, TopicId } from '@lifeos/notes'
import './AIAnalysisPanel.css'

export interface AIAnalysisPanelProps {
  note: Note
  availableNotes: Note[]
  availableTopics: Array<{ topicId: TopicId; name: string }>
  onClose: () => void
  onTagged?: () => void
}

interface ParagraphAnalysis {
  path: string
  text: string
  fullText: string
  type: string
  position: number
  suggestedTags?: Array<{
    type: 'note' | 'topic'
    id: string
    name: string
    confidence?: number
  }>
}

export function AIAnalysisPanel({
  note,
  availableNotes,
  availableTopics,
  onClose,
  onTagged,
}: AIAnalysisPanelProps) {
  const { user } = useAuth()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [paragraphs, setParagraphs] = useState<ParagraphAnalysis[]>([])
  const [selectedTags, setSelectedTags] = useState<
    Record<string, Array<{ type: 'note' | 'topic'; id: string }>>
  >({})
  const [isTagging, setIsTagging] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const handleAnalyze = useCallback(async () => {
    if (!user) return

    setIsAnalyzing(true)
    try {
      // Extract paragraphs from note content
      const content = note.content as { type: string; content?: unknown[] }

      const extractParagraphs = (node: unknown, path: string[] = []): ParagraphAnalysis[] => {
        const paragraphs: ParagraphAnalysis[] = []
        let position = 0

        if (typeof node === 'object' && node !== null) {
          const nodeObj = node as Record<string, unknown>
          const nodeType = nodeObj.type as string

          if (nodeType === 'paragraph' || nodeType === 'heading') {
            const text = extractText(nodeObj)
            if (text.length >= 50) {
              paragraphs.push({
                path: path.join('.'),
                text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
                fullText: text,
                type: nodeType,
                position,
              })
              position++
            }
          }

          if (nodeObj.content && Array.isArray(nodeObj.content)) {
            nodeObj.content.forEach((child, index) => {
              const childParagraphs = extractParagraphs(child, [...path, index.toString()])
              paragraphs.push(...childParagraphs)
            })
          }
        }

        return paragraphs
      }

      const extractText = (node: Record<string, unknown>): string => {
        if (node.type === 'text' && typeof node.text === 'string') {
          return node.text
        }
        if (node.content && Array.isArray(node.content)) {
          return node.content
            .map((child) => extractText(child as Record<string, unknown>))
            .join(' ')
        }
        return ''
      }

      const extracted = extractParagraphs(content, [])
      setParagraphs(extracted)
      setError(null)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to analyze note')
      console.error('Failed to analyze note:', error)
      setError(error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [user, note])

  const handleToggleTag = useCallback(
    (paragraphPath: string, tagType: 'note' | 'topic', tagId: string) => {
      setSelectedTags((prev) => {
        const current = prev[paragraphPath] || []
        const exists = current.some((t) => t.type === tagType && t.id === tagId)

        if (exists) {
          return {
            ...prev,
            [paragraphPath]: current.filter((t) => !(t.type === tagType && t.id === tagId)),
          }
        } else {
          return {
            ...prev,
            [paragraphPath]: [...current, { type: tagType, id: tagId }],
          }
        }
      })
    },
    []
  )

  const handleApplyTags = useCallback(async () => {
    if (!user || !note) return

    setIsTagging(true)
    try {
      // Update note with paragraph links directly
      const noteRepository = createFirestoreNoteRepository()
      const currentParagraphLinks = note.paragraphLinks || {}

      // Merge selected tags into paragraph links
      const updatedParagraphLinks: Record<string, { noteIds: string[]; topicIds: string[] }> = {
        ...currentParagraphLinks,
      }

      for (const [paragraphPath, tags] of Object.entries(selectedTags)) {
        if (!updatedParagraphLinks[paragraphPath]) {
          updatedParagraphLinks[paragraphPath] = { noteIds: [], topicIds: [] }
        }

        // Add new tags (avoid duplicates)
        for (const tag of tags) {
          if (tag.type === 'note') {
            if (!updatedParagraphLinks[paragraphPath].noteIds.includes(tag.id)) {
              updatedParagraphLinks[paragraphPath].noteIds.push(tag.id)
            }
          } else {
            if (!updatedParagraphLinks[paragraphPath].topicIds.includes(tag.id)) {
              updatedParagraphLinks[paragraphPath].topicIds.push(tag.id)
            }
          }
        }
      }

      // Update note with paragraph links
      await noteRepository.update(user.uid, note.noteId, {
        paragraphLinks: updatedParagraphLinks,
      })

      setError(null)
      onTagged?.()
      onClose()
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to apply tags')
      console.error('Failed to apply tags:', error)
      setError(error)
    } finally {
      setIsTagging(false)
    }
  }, [user, note, selectedTags, onTagged, onClose])

  return (
    <div className="ai-analysis-panel">
      <div className="ai-analysis-panel__header">
        <h3>AI Analysis</h3>
        <button type="button" className="ai-analysis-panel__close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="ai-analysis-panel__content">
        {paragraphs.length === 0 && !isAnalyzing && (
          <div className="ai-analysis-panel__empty">
            <p>Click "Analyze" to identify key paragraphs and ideas in this note.</p>
            <button
              type="button"
              className="ai-analysis-panel__analyze-btn"
              onClick={handleAnalyze}
            >
              Analyze Note
            </button>
          </div>
        )}

        {isAnalyzing && <div className="ai-analysis-panel__loading">Analyzing note...</div>}

        {error && (
          <div className="ai-analysis-panel__error">
            <p>Error: {error.message}</p>
            <button
              type="button"
              className="ai-analysis-panel__retry-btn"
              onClick={() => {
                setError(null)
                void handleAnalyze()
              }}
            >
              Retry
            </button>
          </div>
        )}

        {paragraphs.length > 0 && (
          <div className="ai-analysis-panel__paragraphs">
            {paragraphs.map((para) => (
              <div key={para.path} className="ai-analysis-panel__paragraph">
                <div className="ai-analysis-panel__paragraph-text">{para.text}</div>
                <div className="ai-analysis-panel__tags">
                  <div className="ai-analysis-panel__tag-group">
                    <label>Tag with Notes:</label>
                    <div className="ai-analysis-panel__tag-list">
                      {availableNotes.slice(0, 5).map((n) => {
                        const isSelected = selectedTags[para.path]?.some(
                          (t) => t.type === 'note' && t.id === n.noteId
                        )
                        return (
                          <button
                            key={n.noteId}
                            type="button"
                            className={`ai-analysis-panel__tag ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => handleToggleTag(para.path, 'note', n.noteId)}
                          >
                            {n.title}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="ai-analysis-panel__tag-group">
                    <label>Tag with Topics:</label>
                    <div className="ai-analysis-panel__tag-list">
                      {availableTopics.slice(0, 5).map((t) => {
                        const isSelected = selectedTags[para.path]?.some(
                          (tag) => tag.type === 'topic' && tag.id === t.topicId
                        )
                        return (
                          <button
                            key={t.topicId}
                            type="button"
                            className={`ai-analysis-panel__tag ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => handleToggleTag(para.path, 'topic', t.topicId)}
                          >
                            {t.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {paragraphs.length > 0 && (
        <div className="ai-analysis-panel__footer">
          <button
            type="button"
            className="ai-analysis-panel__apply-btn"
            onClick={handleApplyTags}
            disabled={isTagging || Object.keys(selectedTags).length === 0}
          >
            {isTagging ? 'Applying Tags...' : 'Apply Tags'}
          </button>
        </div>
      )}
    </div>
  )
}
