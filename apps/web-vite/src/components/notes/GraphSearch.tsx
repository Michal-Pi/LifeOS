/**
 * GraphSearch Component
 *
 * Search functionality for graph visualization.
 */

import { useState, useMemo } from 'react'
import type { NoteGraph } from '@lifeos/notes'

export interface GraphSearchProps {
  graph: NoteGraph | null
  onSearchChange?: (query: string) => void
  onExpand?: (noteIds: string[]) => void
}

export function GraphSearch({ graph, onSearchChange, onExpand }: GraphSearchProps) {
  const [query, setQuery] = useState('')

  const matchingNoteIds = useMemo(() => {
    if (!query.trim() || !graph) return new Set<string>()

    const lowerQuery = query.toLowerCase()
    const matches = new Set<string>()

    for (const node of graph.nodes) {
      if (
        node.title.toLowerCase().includes(lowerQuery) ||
        node.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
      ) {
        matches.add(node.noteId)
      }
    }

    return matches
  }, [query, graph])

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery)
    onSearchChange?.(newQuery)
  }

  const handleExpand = () => {
    if (matchingNoteIds.size > 0) {
      onExpand?.(Array.from(matchingNoteIds))
    }
  }

  return (
    <div className="graph-search">
      <input
        type="text"
        placeholder="Search notes..."
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        className="graph-search__input"
      />
      {matchingNoteIds.size > 0 && (
        <div className="graph-search__results">
          Found {matchingNoteIds.size} note{matchingNoteIds.size !== 1 ? 's' : ''}
          <button onClick={handleExpand} className="graph-search__expand">
            Expand connections
          </button>
        </div>
      )}
      <style>{`
        .graph-search {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .graph-search__input {
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.875rem;
        }
        .graph-search__results {
          font-size: 0.8125rem;
          color: var(--muted-foreground);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .graph-search__expand {
          padding: 0.25rem 0.5rem;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  )
}
