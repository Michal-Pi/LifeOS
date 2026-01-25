/**
 * NoteGraphPage Component
 *
 * Dedicated page for visualizing note graphs.
 */

import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNoteGraph } from '@/hooks/useNoteGraph'
import { useTopics } from '@/hooks/useTopics'
import { NoteGraphView } from '@/components/notes/NoteGraphView'
import { GraphSearch } from '@/components/notes/GraphSearch'
import { GraphStats } from '@/components/notes/GraphStats'
import type { GraphFilters } from '@lifeos/notes'

export function NoteGraphPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<GraphFilters>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set())
  const { graph, isLoading, error } = useNoteGraph(filters)
  const { topics } = useTopics()

  const handleNodeClick = useCallback(
    (noteId: string) => {
      navigate(`/notes?noteId=${noteId}`)
    },
    [navigate]
  )

  const highlightedNoteIds = useMemo(() => {
    const ids = new Set<string>()
    if (searchQuery && graph) {
      const lowerQuery = searchQuery.toLowerCase()
      for (const node of graph.nodes) {
        if (
          node.title.toLowerCase().includes(lowerQuery) ||
          node.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
        ) {
          ids.add(node.noteId)
        }
      }
    }
    // Add expanded notes (show their connections)
    if (expandedNoteIds.size > 0 && graph) {
      expandedNoteIds.forEach((expandedId) => {
        ids.add(expandedId)
        // Add connected nodes
        for (const edge of graph.edges) {
          if (edge.fromNoteId === expandedId) {
            ids.add(edge.toNoteId)
          }
          if (edge.toNoteId === expandedId) {
            ids.add(edge.fromNoteId)
          }
        }
      })
    }
    return ids
  }, [searchQuery, graph, expandedNoteIds])

  const handleSearchExpand = useCallback((noteIds: string[]) => {
    setExpandedNoteIds((prev) => {
      const next = new Set(prev)
      noteIds.forEach((id) => next.add(id))
      return next
    })
  }, [])

  const handleHubNoteClick = useCallback(
    (noteId: string) => {
      navigate(`/notes?noteId=${noteId}`)
    },
    [navigate]
  )

  return (
    <div className="note-graph-page">
      <div className="note-graph-page__header">
        <h1>Note Graph</h1>
        <div className="note-graph-page__controls">
          <button onClick={() => navigate('/notes')} className="note-graph-page__back-button">
            Back to Notes
          </button>
        </div>
      </div>

      <div className="note-graph-page__content">
        {isLoading && <div className="note-graph-page__loading">Loading graph...</div>}
        {error && (
          <div className="note-graph-page__error">Error loading graph: {error.message}</div>
        )}
        {graph && !isLoading && (
          <>
            <div className="note-graph-page__sidebar">
              <div className="note-graph-page__filters">
                <h3>Filters</h3>
                <div className="note-graph-page__filter-group">
                  <label htmlFor="topic-filter">Topic:</label>
                  <select
                    id="topic-filter"
                    value={filters.topicId || ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        topicId: e.target.value || undefined,
                      }))
                    }
                    className="note-graph-page__filter-select"
                  >
                    <option value="">All Topics</option>
                    {topics.map((topic) => (
                      <option key={topic.topicId} value={topic.topicId}>
                        {topic.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="note-graph-page__filter-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={filters.includeOrphans !== false}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          includeOrphans: e.target.checked,
                        }))
                      }
                    />
                    Include orphan notes
                  </label>
                </div>
              </div>
              {graph && (
                <GraphSearch
                  graph={graph}
                  onSearchChange={setSearchQuery}
                  onExpand={handleSearchExpand}
                />
              )}
              <GraphStats graph={graph} onHubNoteClick={handleHubNoteClick} />
              <div className="note-graph-page__legend">
                <h4>Edge Types</h4>
                <div className="note-graph-page__legend-item">
                  <span
                    className="note-graph-page__legend-color"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                  <span>Explicit Links</span>
                </div>
                <div className="note-graph-page__legend-item">
                  <span
                    className="note-graph-page__legend-color"
                    style={{ backgroundColor: 'var(--muted-foreground)' }}
                  />
                  <span>Mentions</span>
                </div>
                <div className="note-graph-page__legend-item">
                  <span
                    className="note-graph-page__legend-color"
                    style={{ backgroundColor: 'var(--info)' }}
                  />
                  <span>Shared Projects (≥2)</span>
                </div>
                <div className="note-graph-page__legend-item">
                  <span
                    className="note-graph-page__legend-color"
                    style={{ backgroundColor: 'var(--warning)' }}
                  />
                  <span>Shared Tags (≥2)</span>
                </div>
              </div>
            </div>
            <div className="note-graph-page__graph">
              <NoteGraphView
                graph={graph}
                onNodeClick={handleNodeClick}
                highlightedNoteIds={highlightedNoteIds}
              />
            </div>
          </>
        )}
      </div>

      <style>{`
        .note-graph-page {
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--background);
        }
        .note-graph-page__header {
          flex-shrink: 0;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid var(--border);
          background: var(--card);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .note-graph-page__header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .note-graph-page__controls {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .note-graph-page__back-button {
          padding: 0.5rem 1rem;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
        }
        .note-graph-page__back-button:hover {
          opacity: 0.9;
        }
        .note-graph-page__content {
          flex: 1;
          display: grid;
          grid-template-columns: 280px 1fr;
          overflow: hidden;
        }
        .note-graph-page__sidebar {
          border-right: 1px solid var(--border);
          padding: 1.5rem;
          overflow-y: auto;
          background: var(--card);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .note-graph-page__filters h3 {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .note-graph-page__filter-group {
          margin-bottom: 0.75rem;
          font-size: 0.8125rem;
        }
        .note-graph-page__filter-group label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--muted-foreground);
          cursor: pointer;
        }
        .note-graph-page__filter-select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.8125rem;
          margin-top: 0.25rem;
        }
        .note-graph-page__legend {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }
        .note-graph-page__legend h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .note-graph-page__legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.8125rem;
          color: var(--muted-foreground);
        }
        .note-graph-page__legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }
        .note-graph-page__graph {
          overflow: hidden;
          background: var(--background);
        }
        .note-graph-page__loading,
        .note-graph-page__error {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          color: var(--muted-foreground);
        }
        .note-graph-page__error {
          color: var(--error);
        }
      `}</style>
    </div>
  )
}
