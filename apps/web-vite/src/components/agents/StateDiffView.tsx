/**
 * StateDiffView
 *
 * Two-column diff between two NodeStateEntry output deltas.
 * Green = added, yellow = modified, red = removed.
 */

import { useMemo } from 'react'
import type { NodeStateEntry } from '@/hooks/useNodeStateTimeline'
import { diffObjects } from '@/lib/objectDiff'
import './StateDiffView.css'

interface StateDiffViewProps {
  before: NodeStateEntry
  after: NodeStateEntry
  onClose: () => void
}

function formatValue(val: unknown): string {
  if (val === undefined) return 'undefined'
  if (typeof val === 'string') return val.length > 120 ? val.slice(0, 120) + '...' : val
  return JSON.stringify(val, null, 2)
}

export function StateDiffView({ before, after, onClose }: StateDiffViewProps) {
  const diff = useMemo(
    () =>
      diffObjects(
        before.outputDelta as unknown as Record<string, unknown>,
        after.outputDelta as unknown as Record<string, unknown>
      ),
    [before, after]
  )

  const addedKeys = Object.keys(diff.added)
  const removedKeys = Object.keys(diff.removed)
  const modifiedKeys = Object.keys(diff.modified)
  const unchangedKeys = Object.keys(diff.unchanged)

  return (
    <div className="state-diff-view">
      <div className="state-diff-view__header">
        <span className="state-diff-view__label">
          Diff: {before.nodeLabel} &rarr; {after.nodeLabel}
        </span>
        <button className="state-diff-view__close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="state-diff-view__body">
        {/* Before column */}
        <div className="state-diff-view__column">
          <div className="state-diff-view__column-header">Before ({before.nodeLabel})</div>
          {removedKeys.map((key) => (
            <div key={key} className="state-diff-line state-diff-line--removed">
              <span className="state-diff-line__key">{key}:</span> {formatValue(diff.removed[key])}
            </div>
          ))}
          {modifiedKeys.map((key) => (
            <div key={key} className="state-diff-line state-diff-line--modified">
              <span className="state-diff-line__key">{key}:</span>{' '}
              {formatValue(diff.modified[key].before)}
            </div>
          ))}
          {unchangedKeys.map((key) => (
            <div key={key} className="state-diff-line state-diff-line--unchanged">
              <span className="state-diff-line__key">{key}:</span>{' '}
              {formatValue(diff.unchanged[key])}
            </div>
          ))}
        </div>
        {/* After column */}
        <div className="state-diff-view__column">
          <div className="state-diff-view__column-header">After ({after.nodeLabel})</div>
          {addedKeys.map((key) => (
            <div key={key} className="state-diff-line state-diff-line--added">
              <span className="state-diff-line__key">{key}:</span> {formatValue(diff.added[key])}
            </div>
          ))}
          {modifiedKeys.map((key) => (
            <div key={key} className="state-diff-line state-diff-line--modified">
              <span className="state-diff-line__key">{key}:</span>{' '}
              {formatValue(diff.modified[key].after)}
            </div>
          ))}
          {unchangedKeys.map((key) => (
            <div key={key} className="state-diff-line state-diff-line--unchanged">
              <span className="state-diff-line__key">{key}:</span>{' '}
              {formatValue(diff.unchanged[key])}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
