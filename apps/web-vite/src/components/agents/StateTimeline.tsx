/**
 * StateTimeline
 *
 * Collapsible card list showing per-node execution state from node_state_snapshot events.
 * Each card shows: node label, type badge, duration, tokens, cost.
 * Expand a card to see input/output JSON.
 */

import { useState, useCallback, lazy, Suspense } from 'react'
import type { NodeStateEntry } from '@/hooks/useNodeStateTimeline'
import './StateTimeline.css'

const StateDiffView = lazy(() =>
  import('./StateDiffView').then((m) => ({ default: m.StateDiffView }))
)

interface StateTimelineProps {
  entries: NodeStateEntry[]
}

export function StateTimeline({ entries }: StateTimelineProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())
  const [diffPair, setDiffPair] = useState<{ before: number; after: number } | null>(null)

  const toggleCard = useCallback((index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  if (entries.length === 0) return null

  return (
    <div className="state-timeline">
      <div className="state-timeline__header">
        <span className="state-timeline__title">Node Execution Timeline</span>
        <span className="state-timeline__count">{entries.length} nodes</span>
      </div>
      {entries.map((entry, i) => {
        const isOpen = expandedIndices.has(i)
        return (
          <div
            key={`${entry.nodeId}-${entry.timestampMs}`}
            className={`state-timeline-card${isOpen ? ' state-timeline-card--open' : ''}`}
          >
            <div
              className="state-timeline-card__summary"
              onClick={() => toggleCard(i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleCard(i)
                }
              }}
            >
              <span className="state-timeline-card__chevron">&#9654;</span>
              <span className="state-timeline-card__order">{i + 1}</span>
              <span className="state-timeline-card__label">{entry.nodeLabel}</span>
              <span
                className={`state-timeline-card__type-badge state-timeline-card__type-badge--${entry.nodeType}`}
              >
                {entry.nodeType}
              </span>
              <span className="state-timeline-card__metrics">
                {entry.outputDelta.durationMs != null && (
                  <span className="state-timeline-card__metric">
                    {entry.outputDelta.durationMs >= 1000
                      ? `${(entry.outputDelta.durationMs / 1000).toFixed(1)}s`
                      : `${entry.outputDelta.durationMs}ms`}
                  </span>
                )}
                {entry.outputDelta.tokensUsed != null && entry.outputDelta.tokensUsed > 0 && (
                  <span className="state-timeline-card__metric">
                    {entry.outputDelta.tokensUsed.toLocaleString()} tok
                  </span>
                )}
                {entry.outputDelta.estimatedCost != null && entry.outputDelta.estimatedCost > 0 && (
                  <span className="state-timeline-card__metric">
                    ${entry.outputDelta.estimatedCost.toFixed(4)}
                  </span>
                )}
              </span>
            </div>

            {isOpen && (
              <div className="state-timeline-card__detail">
                <div>
                  <div className="state-timeline-card__section-label">Input State</div>
                  <pre className="state-timeline-card__json">
                    {JSON.stringify(entry.inputState, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="state-timeline-card__section-label">Output Delta</div>
                  <pre className="state-timeline-card__json">
                    {JSON.stringify(entry.outputDelta, null, 2)}
                  </pre>
                </div>
                {entry.edgesFromNode.length > 0 && (
                  <div>
                    <div className="state-timeline-card__section-label">Edges</div>
                    <div className="state-timeline-card__edges">
                      {entry.edgesFromNode.map((edge) => (
                        <span key={edge.to} className="state-timeline-card__edge">
                          {edge.conditionType} &rarr; {edge.to}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {i > 0 && (
                  <button
                    className="state-timeline-card__compare-btn"
                    onClick={() => setDiffPair({ before: i - 1, after: i })}
                  >
                    Compare with previous
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {diffPair && entries[diffPair.before] && entries[diffPair.after] && (
        <Suspense fallback={null}>
          <StateDiffView
            before={entries[diffPair.before]}
            after={entries[diffPair.after]}
            onClose={() => setDiffPair(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
