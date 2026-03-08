/**
 * KGNodeInspector — Sidebar panel showing details for a selected graph node or edge.
 */

import type { CompactGraph } from '@lifeos/agents'

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

interface KGNodeInspectorProps {
  graph: CompactGraph
  selectedNodeId: string | null
  selectedEdge: { from: string; to: string; rel: string } | null
  onClose: () => void
  onFocusNeighborhood: (nodeId: string) => void
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    value >= 0.8
      ? 'var(--success)'
      : value >= 0.6
        ? 'var(--warning)'
        : 'var(--error)'

  return (
    <div className="kg-confidence-bar">
      <div className="kg-confidence-fill" style={{ width: `${pct}%`, background: color }} />
      <span className="kg-confidence-label">{pct}%</span>
    </div>
  )
}

function NodeTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    claim: '◉',
    concept: '◇',
    mechanism: '⬡',
    prediction: '△',
  }
  return <span className={`kg-type-icon kg-type-${type}`}>{icons[type] || '●'}</span>
}

function RelBadge({ rel }: { rel: string }) {
  const colors: Record<string, string> = {
    supports: 'var(--success)',
    contradicts: 'var(--error)',
    causes: 'var(--text-secondary)',
    mediates: 'var(--accent)',
    scopes: 'var(--text-tertiary)',
  }
  return (
    <span className="kg-rel-badge" style={{ borderColor: colors[rel] || 'var(--border)' }}>
      {rel}
    </span>
  )
}

export function KGNodeInspector({
  graph,
  selectedNodeId,
  selectedEdge,
  onClose,
  onFocusNeighborhood,
}: KGNodeInspectorProps) {
  if (!selectedNodeId && !selectedEdge) return null

  // Find connected edges for a node
  const getConnectedEdges = (nodeId: string) => {
    return graph.edges.filter((e) => e.from === nodeId || e.to === nodeId)
  }

  // Render node details
  if (selectedNodeId) {
    const node = graph.nodes.find((n) => n.id === selectedNodeId)
    if (!node) return null

    const connectedEdges = getConnectedEdges(node.id)
    const connectedNodeIds = new Set(
      connectedEdges.flatMap((e) => [e.from, e.to]).filter((id) => id !== node.id)
    )
    const connectedNodes = graph.nodes.filter((n) => connectedNodeIds.has(n.id))

    return (
      <div className="kg-inspector">
        <div className="kg-inspector-header">
          <div className="kg-inspector-title">
            <NodeTypeIcon type={node.type} />
            <span className="kg-inspector-name">{node.label}</span>
          </div>
          <button className="kg-inspector-close" onClick={onClose} aria-label="Close inspector">
            ✕
          </button>
        </div>

        <div className="kg-inspector-body">
          <div className="kg-inspector-section">
            <span className={`kg-type-badge kg-type-${node.type}`}>{node.type}</span>
          </div>

          {node.sourceConfidence !== undefined && (
            <div className="kg-inspector-section">
              <h4 className="kg-inspector-label">Source Confidence</h4>
              <ConfidenceBar value={node.sourceConfidence} />
            </div>
          )}

          {node.note && (
            <div className="kg-inspector-section">
              <h4 className="kg-inspector-label">Note</h4>
              <p className="kg-inspector-text">{node.note}</p>
            </div>
          )}

          {node.sourceUrl && (
            <div className="kg-inspector-section">
              <h4 className="kg-inspector-label">Source</h4>
              <a
                href={node.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="kg-inspector-link"
              >
                {safeHostname(node.sourceUrl)}
              </a>
            </div>
          )}

          {connectedEdges.length > 0 && (
            <div className="kg-inspector-section">
              <h4 className="kg-inspector-label">
                Connections ({connectedEdges.length})
              </h4>
              <ul className="kg-inspector-edges">
                {connectedEdges.slice(0, 10).map((edge, i) => {
                  const otherNodeId = edge.from === node.id ? edge.to : edge.from
                  const otherNode = connectedNodes.find((n) => n.id === otherNodeId)
                  const direction = edge.from === node.id ? '→' : '←'
                  return (
                    <li key={i} className="kg-inspector-edge-item">
                      <RelBadge rel={edge.rel} />
                      <span className="kg-edge-direction">{direction}</span>
                      <span className="kg-edge-target">
                        {otherNode?.label || otherNodeId}
                      </span>
                      {edge.weight !== undefined && (
                        <span className="kg-edge-weight">w:{edge.weight.toFixed(2)}</span>
                      )}
                    </li>
                  )
                })}
                {connectedEdges.length > 10 && (
                  <li className="kg-inspector-more">
                    +{connectedEdges.length - 10} more
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="kg-inspector-actions">
            <button
              className="ghost-button kg-inspector-focus-btn"
              onClick={() => onFocusNeighborhood(node.id)}
            >
              Focus neighborhood
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render edge details
  if (selectedEdge) {
    const fromNode = graph.nodes.find((n) => n.id === selectedEdge.from)
    const toNode = graph.nodes.find((n) => n.id === selectedEdge.to)
    const edgeFull = graph.edges.find(
      (e) => e.from === selectedEdge.from && e.to === selectedEdge.to && e.rel === selectedEdge.rel
    )

    return (
      <div className="kg-inspector">
        <div className="kg-inspector-header">
          <div className="kg-inspector-title">
            <span className="kg-inspector-name">Edge Details</span>
          </div>
          <button className="kg-inspector-close" onClick={onClose} aria-label="Close inspector">
            ✕
          </button>
        </div>

        <div className="kg-inspector-body">
          <div className="kg-inspector-section">
            <RelBadge rel={selectedEdge.rel} />
          </div>

          <div className="kg-inspector-section">
            <h4 className="kg-inspector-label">From</h4>
            <div className="kg-inspector-edge-node">
              {fromNode && <NodeTypeIcon type={fromNode.type} />}
              <span>{fromNode?.label || selectedEdge.from}</span>
            </div>
          </div>

          <div className="kg-inspector-section">
            <h4 className="kg-inspector-label">To</h4>
            <div className="kg-inspector-edge-node">
              {toNode && <NodeTypeIcon type={toNode.type} />}
              <span>{toNode?.label || selectedEdge.to}</span>
            </div>
          </div>

          {edgeFull?.weight !== undefined && (
            <div className="kg-inspector-section">
              <h4 className="kg-inspector-label">Weight</h4>
              <span className="kg-inspector-text">{edgeFull.weight.toFixed(3)}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
