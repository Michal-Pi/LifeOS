/**
 * KGTimelineBar — Bottom timeline showing KG growth across pipeline phases.
 * Includes a time-travel slider to scrub through KGSnapshots.
 */

import type { KGSnapshot } from '@lifeos/agents'

interface KGTimelineBarProps {
  snapshots: KGSnapshot[]
  currentIndex: number
  onIndexChange: (index: number) => void
}

const PHASE_SHORT_LABELS: Record<string, string> = {
  sense_making: 'Sense',
  search_planning: 'Plan',
  search_execution: 'Search',
  source_ingestion: 'Ingest',
  claim_extraction: 'Extract',
  kg_construction: 'Build KG',
  kg_snapshot: 'Snapshot',
  gap_analysis: 'Gap',
  thesis_generation: 'Thesis',
  cross_negation: 'Negate',
  contradiction_crystallization: 'Contradict',
  sublation: 'Sublate',
  meta_reflection: 'Meta',
  answer_generation: 'Answer',
}

function SnapshotBar({ snapshot, maxCount }: { snapshot: KGSnapshot; maxCount: number }) {
  const total =
    snapshot.stats.claimCount +
    snapshot.stats.conceptCount +
    snapshot.stats.mechanismCount +
    snapshot.stats.contradictionCount

  const height = maxCount > 0 ? Math.max(8, (total / maxCount) * 60) : 8

  return (
    <div className="kg-timeline-bar-column">
      <div className="kg-timeline-bar-stack" style={{ height: `${height}px` }}>
        {snapshot.stats.claimCount > 0 && (
          <div
            className="kg-timeline-segment kg-seg-claim"
            style={{
              height: `${(snapshot.stats.claimCount / total) * 100}%`,
            }}
            title={`${snapshot.stats.claimCount} claims`}
          />
        )}
        {snapshot.stats.conceptCount > 0 && (
          <div
            className="kg-timeline-segment kg-seg-concept"
            style={{
              height: `${(snapshot.stats.conceptCount / total) * 100}%`,
            }}
            title={`${snapshot.stats.conceptCount} concepts`}
          />
        )}
        {snapshot.stats.mechanismCount > 0 && (
          <div
            className="kg-timeline-segment kg-seg-mechanism"
            style={{
              height: `${(snapshot.stats.mechanismCount / total) * 100}%`,
            }}
            title={`${snapshot.stats.mechanismCount} mechanisms`}
          />
        )}
        {snapshot.stats.contradictionCount > 0 && (
          <div
            className="kg-timeline-segment kg-seg-contradiction"
            style={{
              height: `${(snapshot.stats.contradictionCount / total) * 100}%`,
            }}
            title={`${snapshot.stats.contradictionCount} contradictions`}
          />
        )}
      </div>
      <span className="kg-timeline-phase-label">
        {PHASE_SHORT_LABELS[snapshot.phase] || snapshot.phase}
      </span>
    </div>
  )
}

export function KGTimelineBar({ snapshots, currentIndex, onIndexChange }: KGTimelineBarProps) {
  if (snapshots.length === 0) return null

  const maxCount = Math.max(
    ...snapshots.map(
      (s) =>
        s.stats.claimCount +
        s.stats.conceptCount +
        s.stats.mechanismCount +
        s.stats.contradictionCount
    )
  )

  const current = snapshots[currentIndex]
  const delta = current?.delta

  return (
    <div className="kg-timeline">
      <div className="kg-timeline-header">
        <h4 className="kg-section-title">KG Growth Timeline</h4>
        {delta && (
          <div className="kg-timeline-delta">
            {delta.addedNodeIds.length > 0 && (
              <span className="kg-delta-badge kg-delta-added">
                +{delta.addedNodeIds.length} nodes
              </span>
            )}
            {delta.supersededNodeIds.length > 0 && (
              <span className="kg-delta-badge kg-delta-removed">
                -{delta.supersededNodeIds.length} superseded
              </span>
            )}
            {delta.addedEdgeKeys.length > 0 && (
              <span className="kg-delta-badge kg-delta-added">
                +{delta.addedEdgeKeys.length} edges
              </span>
            )}
          </div>
        )}
      </div>

      <div className="kg-timeline-bars">
        {snapshots.map((snapshot, i) => (
          <div
            key={i}
            className={`kg-timeline-bar-wrapper ${i === currentIndex ? 'active' : ''}`}
            onClick={() => onIndexChange(i)}
          >
            <SnapshotBar snapshot={snapshot} maxCount={maxCount} />
          </div>
        ))}
      </div>

      <div className="kg-timeline-slider">
        <input
          type="range"
          min={0}
          max={snapshots.length - 1}
          value={currentIndex}
          onChange={(e) => onIndexChange(Number(e.target.value))}
          className="kg-slider-input"
        />
        <div className="kg-slider-labels">
          <span className="kg-slider-label-start">
            {PHASE_SHORT_LABELS[snapshots[0]?.phase] || 'Start'}
          </span>
          <span className="kg-slider-label-current">
            Step {currentIndex + 1}/{snapshots.length}
            {current ? ` — ${PHASE_SHORT_LABELS[current.phase] || current.phase}` : ''}
          </span>
          <span className="kg-slider-label-end">
            {PHASE_SHORT_LABELS[snapshots[snapshots.length - 1]?.phase] || 'End'}
          </span>
        </div>
      </div>

      <div className="kg-timeline-legend">
        <span className="kg-legend-item">
          <span className="kg-legend-dot kg-seg-claim" /> Claims
        </span>
        <span className="kg-legend-item">
          <span className="kg-legend-dot kg-seg-concept" /> Concepts
        </span>
        <span className="kg-legend-item">
          <span className="kg-legend-dot kg-seg-mechanism" /> Mechanisms
        </span>
        <span className="kg-legend-item">
          <span className="kg-legend-dot kg-seg-contradiction" /> Contradictions
        </span>
      </div>
    </div>
  )
}
