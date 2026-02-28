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
import '@/styles/pages/NoteGraphPage.css'

export function NoteGraphPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<GraphFilters>({
    minSharedTags: 1, // Default to 1 for better tag-based connections
    minSharedProjects: 2,
  })
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
                <div className="note-graph-page__filter-group">
                  <label htmlFor="min-shared-tags">Min shared tags:</label>
                  <select
                    id="min-shared-tags"
                    value={filters.minSharedTags ?? 1}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        minSharedTags: parseInt(e.target.value, 10),
                      }))
                    }
                    className="note-graph-page__filter-select"
                  >
                    <option value="0">Off</option>
                    <option value="1">1 tag</option>
                    <option value="2">2 tags</option>
                    <option value="3">3 tags</option>
                  </select>
                </div>
                <div className="note-graph-page__filter-group">
                  <label htmlFor="min-shared-projects">Min shared projects:</label>
                  <select
                    id="min-shared-projects"
                    value={filters.minSharedProjects ?? 2}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        minSharedProjects: parseInt(e.target.value, 10),
                      }))
                    }
                    className="note-graph-page__filter-select"
                  >
                    <option value="0">Off</option>
                    <option value="1">1 project</option>
                    <option value="2">2 projects</option>
                    <option value="3">3 projects</option>
                  </select>
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
                {(filters.minSharedProjects ?? 2) > 0 && (
                  <div className="note-graph-page__legend-item">
                    <span
                      className="note-graph-page__legend-color"
                      style={{ backgroundColor: 'var(--info)' }}
                    />
                    <span>Shared Projects (≥{filters.minSharedProjects ?? 2})</span>
                  </div>
                )}
                {(filters.minSharedTags ?? 1) > 0 && (
                  <div className="note-graph-page__legend-item">
                    <span
                      className="note-graph-page__legend-color"
                      style={{ backgroundColor: 'var(--warning)' }}
                    />
                    <span>Shared Tags (≥{filters.minSharedTags ?? 1})</span>
                  </div>
                )}
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
    </div>
  )
}
