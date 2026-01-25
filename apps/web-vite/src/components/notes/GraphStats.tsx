/**
 * GraphStats Component
 *
 * Displays graph analytics and statistics.
 */

import { useMemo } from 'react'
import type { NoteGraph } from '@lifeos/notes'
import { detectClusters, findHubNotes, calculateGraphDensity } from '@/notes/graphAnalytics'

export interface GraphStatsProps {
  graph: NoteGraph | null
  onHubNoteClick?: (noteId: string) => void
}

export function GraphStats({ graph, onHubNoteClick }: GraphStatsProps) {
  const clusters = useMemo(() => (graph ? detectClusters(graph) : new Map()), [graph])
  const hubNotes = useMemo(() => (graph ? findHubNotes(graph, 5) : []), [graph])
  const density = useMemo(() => (graph ? calculateGraphDensity(graph) : 0), [graph])

  const clusterCount = useMemo(() => {
    if (!graph) return 0
    const uniqueClusters = new Set(clusters.values())
    return uniqueClusters.size
  }, [clusters, graph])

  const orphanCount = useMemo(() => {
    if (!graph) return 0
    const connectedNoteIds = new Set<string>()
    for (const edge of graph.edges) {
      connectedNoteIds.add(edge.fromNoteId)
      connectedNoteIds.add(edge.toNoteId)
    }
    return graph.nodes.filter((node) => !connectedNoteIds.has(node.noteId)).length
  }, [graph])

  if (!graph) {
    return (
      <div className="graph-stats">
        <div className="graph-stats__section">
          <div className="graph-stats__metric">
            <span className="graph-stats__metric-label">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="graph-stats">
      <div className="graph-stats__section">
        <h3>Overview</h3>
        <div className="graph-stats__metric">
          <span className="graph-stats__metric-label">Total Notes:</span>
          <span className="graph-stats__metric-value">{graph?.nodes.length || 0}</span>
        </div>
        <div className="graph-stats__metric">
          <span className="graph-stats__metric-label">Connections:</span>
          <span className="graph-stats__metric-value">{graph?.edges.length || 0}</span>
        </div>
        <div className="graph-stats__metric">
          <span className="graph-stats__metric-label">Density:</span>
          <span className="graph-stats__metric-value">{(density * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="graph-stats__section">
        <h3>Structure</h3>
        <div className="graph-stats__metric">
          <span className="graph-stats__metric-label">Clusters:</span>
          <span className="graph-stats__metric-value">{clusterCount}</span>
        </div>
        <div className="graph-stats__metric">
          <span className="graph-stats__metric-label">Orphan Notes:</span>
          <span className="graph-stats__metric-value">{orphanCount}</span>
        </div>
      </div>

      {hubNotes.length > 0 && graph && (
        <div className="graph-stats__section">
          <h3>Hub Notes</h3>
          <div className="graph-stats__hub-list">
            {hubNotes.slice(0, 5).map((noteId) => {
              const node = graph.nodes.find((n) => n.noteId === noteId)
              if (!node) return null
              return (
                <div
                  key={noteId}
                  className="graph-stats__hub-item"
                  onClick={() => onHubNoteClick?.(noteId)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="graph-stats__hub-title">{node.title}</span>
                  <span className="graph-stats__hub-count">
                    {node.linkCount + node.backlinkCount} connections
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        .graph-stats {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .graph-stats__section h3 {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .graph-stats__metric {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          font-size: 0.8125rem;
        }
        .graph-stats__metric-label {
          color: var(--muted-foreground);
        }
        .graph-stats__metric-value {
          font-weight: 600;
          color: var(--foreground);
        }
        .graph-stats__hub-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .graph-stats__hub-item {
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .graph-stats__hub-item:hover {
          background: var(--background-secondary);
        }
        .graph-stats__hub-title {
          display: block;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--foreground);
          margin-bottom: 0.25rem;
        }
        .graph-stats__hub-count {
          display: block;
          font-size: 0.75rem;
          color: var(--muted-foreground);
        }
      `}</style>
    </div>
  )
}
