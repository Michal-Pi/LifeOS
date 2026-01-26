/**
 * OKR Linker Component
 *
 * Allows users to link notes to specific OKRs (Objectives and Key Results)
 * from their projects and chapters for learning tracking and progress monitoring.
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { getUserFriendlyError } from '@/utils/errorMessages'

export interface OKRLinkerProps {
  selectedOKRIds: string[]
  onChange: (okrIds: string[]) => void
  className?: string
}

interface OKRItem {
  id: string
  type: 'project' | 'chapter'
  title: string
  objective?: string
  keyResults?: { id: string; text: string }[]
  domain?: string
}

export function OKRLinker({ selectedOKRIds, onChange, className = '' }: OKRLinkerProps) {
  const { user } = useAuth()
  const userId = user?.uid || ''
  const { projects, chapters, loading: todoLoading, loadData } = useTodoOperations({ userId })

  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [loadError, setLoadError] = useState<Error | null>(null)

  // Load projects and chapters when dropdown opens
  useEffect(() => {
    if (isOpen && !initialLoadDone && userId) {
      const loadOKRs = async () => {
        try {
          setLoadError(null)
          await loadData({ includeTasks: false })
          setInitialLoadDone(true)
        } catch (error) {
          console.error('Failed to load OKRs:', error)
          const err =
            error instanceof Error ? error : new Error('Failed to load projects and chapters')
          setLoadError(err)

          // Show user-friendly error toast
          const friendlyError = getUserFriendlyError(err)
          toast.error(friendlyError.title, {
            description: friendlyError.description,
          })
        }
      }
      void loadOKRs()
    }
  }, [isOpen, initialLoadDone, userId, loadData])

  const buildOKRList = (): OKRItem[] => {
    const items: OKRItem[] = []

    // Add projects with OKRs
    projects
      .filter((p) => p.objective || (p.keyResults && p.keyResults.length > 0))
      .forEach((p) => {
        items.push({
          id: p.id,
          type: 'project',
          title: p.title,
          objective: p.objective,
          keyResults: p.keyResults,
          domain: p.domain,
        })
      })

    // Add chapters with OKRs
    chapters
      .filter((m) => m.objective || (m.keyResults && m.keyResults.length > 0))
      .forEach((m) => {
        const project = projects.find((p) => p.id === m.projectId)
        items.push({
          id: m.id,
          type: 'chapter',
          title: `${project?.title || 'Project'} > ${m.title}`,
          objective: m.objective,
          keyResults: m.keyResults,
          domain: project?.domain,
        })
      })

    return items
  }

  const filteredOKRs = buildOKRList().filter((okr) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      okr.title.toLowerCase().includes(query) ||
      okr.objective?.toLowerCase().includes(query) ||
      okr.keyResults?.some((kr) => kr.text.toLowerCase().includes(query))
    )
  })

  const toggleOKR = (okrId: string) => {
    if (selectedOKRIds.includes(okrId)) {
      onChange(selectedOKRIds.filter((id) => id !== okrId))
    } else {
      onChange([...selectedOKRIds, okrId])
    }
  }

  const getSelectedOKRs = (): OKRItem[] => {
    const allOKRs = buildOKRList()
    return selectedOKRIds
      .map((id) => allOKRs.find((okr) => okr.id === id))
      .filter(Boolean) as OKRItem[]
  }

  const selectedOKRs = getSelectedOKRs()

  return (
    <div className={`okr-linker ${className}`}>
      {/* Selected OKRs Display */}
      {selectedOKRs.length > 0 && (
        <div className="selected-okrs">
          <label className="label">Linked OKRs:</label>
          <div className="okr-chips">
            {selectedOKRs.map((okr) => (
              <div key={okr.id} className="okr-chip">
                <span className="okr-type">{okr.type === 'project' ? '📊' : '🎯'}</span>
                <span className="okr-title">{okr.title}</span>
                <button
                  onClick={() => toggleOKR(okr.id)}
                  className="remove-btn"
                  aria-label="Remove OKR"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add OKR Button */}
      <button onClick={() => setIsOpen(!isOpen)} className="add-okr-btn">
        {selectedOKRs.length > 0 ? '+ Add More OKRs' : '+ Link to OKR'}
      </button>

      {/* OKR Selector Dropdown */}
      {isOpen && (
        <div className="okr-dropdown">
          <div className="dropdown-header">
            <input
              type="text"
              placeholder="Search OKRs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              autoFocus
            />
            <button onClick={() => setIsOpen(false)} className="close-btn">
              ×
            </button>
          </div>

          <div className="okr-list">
            {todoLoading && <p className="loading">Loading OKRs...</p>}

            {loadError && (
              <div className="okr-error">
                <p className="error-message">Failed to load projects and chapters</p>
                <button
                  type="button"
                  className="retry-button"
                  onClick={() => {
                    setInitialLoadDone(false)
                    setLoadError(null)
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {!todoLoading && !loadError && filteredOKRs.length === 0 && (
              <p className="empty-state">
                {searchQuery
                  ? 'No OKRs found matching your search'
                  : 'No OKRs available. Create projects with objectives and key results to link them to notes.'}
              </p>
            )}

            {!todoLoading &&
              filteredOKRs.map((okr) => (
                <div
                  key={okr.id}
                  className={`okr-item ${selectedOKRIds.includes(okr.id) ? 'selected' : ''}`}
                  onClick={() => toggleOKR(okr.id)}
                >
                  <div className="okr-item-header">
                    <span className="okr-type-icon">{okr.type === 'project' ? '📊' : '🎯'}</span>
                    <div className="okr-item-info">
                      <p className="okr-item-title">{okr.title}</p>
                      {okr.domain && <span className="okr-domain">{okr.domain}</span>}
                    </div>
                    {selectedOKRIds.includes(okr.id) && <span className="check-icon">✓</span>}
                  </div>

                  {okr.objective && (
                    <p className="okr-objective">
                      <strong>Objective:</strong> {okr.objective}
                    </p>
                  )}

                  {okr.keyResults && okr.keyResults.length > 0 && (
                    <div className="okr-key-results">
                      <strong>Key Results:</strong>
                      <ul>
                        {okr.keyResults.slice(0, 2).map((kr) => (
                          <li key={kr.id}>{kr.text}</li>
                        ))}
                        {okr.keyResults.length > 2 && (
                          <li className="more">+{okr.keyResults.length - 2} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div className="okr-error">
          <p className="error-message">Failed to load projects and chapters</p>
          <button
            type="button"
            className="retry-button"
            onClick={() => {
              setInitialLoadDone(false)
              setLoadError(null)
            }}
          >
            Retry
          </button>
        </div>
      )}

      <style>{`
        .okr-linker {
          margin: 16px 0;
        }

        .selected-okrs {
          margin-bottom: 12px;
        }

        .label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: var(--foreground);
          margin-bottom: 8px;
        }

        .okr-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .okr-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: var(--muted);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
        }

        .okr-type {
          font-size: 16px;
        }

        .okr-title {
          color: var(--foreground);
        }

        .remove-btn {
          margin-left: 4px;
          padding: 0 4px;
          background: none;
          border: none;
          color: var(--muted-foreground);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        .remove-btn:hover {
          color: var(--error);
        }

        .add-okr-btn {
          padding: 8px 12px;
          background: var(--background-secondary);
          border: 1px dashed var(--border);
          border-radius: 10px;
          color: var(--muted-foreground);
          cursor: pointer;
          font-size: 13px;
          width: 100%;
          text-align: left;
        }

        .add-okr-btn:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
          color: var(--accent);
        }

        .okr-dropdown {
          position: relative;
          margin-top: 8px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          max-height: 400px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .dropdown-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-bottom: 1px solid var(--border);
        }

        .search-input {
          flex: 1;
          height: 32px;
          padding: 0 8px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: transparent;
          color: var(--foreground);
          font-size: 13px;
          transition:
            border-color var(--motion-standard) var(--motion-ease),
            box-shadow var(--motion-standard) var(--motion-ease);
        }

        .search-input:focus-visible {
          outline: 2px solid transparent;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .close-btn {
          padding: 0 8px;
          background: none;
          border: none;
          color: var(--muted-foreground);
          cursor: pointer;
          font-size: 24px;
          line-height: 1;
        }

        .close-btn:hover {
          color: var(--foreground);
        }

        .okr-list {
          overflow-y: auto;
          max-height: 320px;
        }

        .loading,
        .empty-state {
          padding: 24px;
          text-align: center;
          color: var(--muted-foreground);
          font-size: 13px;
        }

        .okr-item {
          padding: 12px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: background var(--motion-fast) var(--motion-ease);
        }

        .okr-item:hover {
          background: var(--background-tertiary);
        }

        .okr-item.selected {
          background: var(--background-secondary);
          border-left: 3px solid var(--accent);
        }

        .okr-item:last-child {
          border-bottom: none;
        }

        .okr-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .okr-type-icon {
          font-size: 20px;
          flex-shrink: 0;
        }

        .okr-item-info {
          flex: 1;
        }

        .okr-item-title {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
          color: var(--foreground);
        }

        .okr-domain {
          display: inline-block;
          margin-top: 2px;
          padding: 2px 6px;
          background: var(--background-secondary);
          border-radius: 8px;
          font-size: 11px;
          color: var(--muted-foreground);
          text-transform: capitalize;
        }

        .check-icon {
          color: var(--accent);
          font-size: 18px;
          font-weight: bold;
        }

        .okr-objective {
          margin: 4px 0;
          font-size: 13px;
          color: var(--muted-foreground);
        }

        .okr-objective strong {
          color: var(--foreground);
        }

        .okr-key-results {
          margin-top: 8px;
          font-size: 12px;
          color: var(--muted-foreground);
        }

        .okr-key-results strong {
          display: block;
          margin-bottom: 4px;
          color: var(--foreground);
        }

        .okr-key-results ul {
          margin: 0;
          padding-left: 20px;
        }

        .okr-key-results li {
          margin: 2px 0;
        }

        .okr-key-results li.more {
          font-style: italic;
          color: var(--muted-foreground);
        }

        .okr-error {
          padding: 12px;
          margin: 8px 0;
          background: var(--destructive-subtle);
          border: 1px solid var(--destructive);
          border-radius: 6px;
          color: var(--destructive-foreground);
        }

        .error-message {
          margin: 0 0 8px 0;
          font-size: 14px;
        }

        .retry-button {
          padding: 6px 12px;
          background: var(--destructive);
          color: var(--destructive-foreground);
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
          transition: background-color var(--motion-fast) var(--motion-ease);
        }

        .retry-button:hover {
          background: var(--destructive-hover);
        }
      `}</style>
    </div>
  )
}
