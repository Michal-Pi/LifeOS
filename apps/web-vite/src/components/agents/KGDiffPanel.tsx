/**
 * KGDiffPanel — Cycle-to-cycle diff comparison view.
 *
 * Allows selecting two cycles and showing what nodes/edges/contradictions
 * were added, removed, or modified between them.
 */

import { useState, useMemo } from 'react'
import type { GraphDiff } from '@lifeos/agents'

interface KGDiffPanelProps {
  graphHistory: Array<{ cycle: number; diff: GraphDiff }>
  onHighlightDiff: (diff: GraphDiff | null) => void
}

function edgeKey(e: { from: string; to: string; rel: string }): string {
  return `${e.from}→${e.rel}→${e.to}`
}

function mergeDiffs(diffs: GraphDiff[]): GraphDiff {
  const addedSet = new Set<string>()
  const removedSet = new Set<string>()
  const modifiedMap = new Map<string, { oldLabel: string; newLabel: string }>()
  const addedEdgeSet = new Set<string>()
  const removedEdgeSet = new Set<string>()
  const addedEdgeMap = new Map<string, { from: string; to: string; rel: string }>()
  const removedEdgeMap = new Map<string, { from: string; to: string; rel: string }>()
  const newContradictions = new Set<string>()
  const resolvedContradictions = new Set<string>()

  for (const diff of diffs) {
    for (const nodeId of diff.addedNodes) {
      if (removedSet.has(nodeId)) {
        removedSet.delete(nodeId)
      } else {
        addedSet.add(nodeId)
      }
    }
    for (const nodeId of diff.removedNodes) {
      if (addedSet.has(nodeId)) {
        addedSet.delete(nodeId)
      } else {
        removedSet.add(nodeId)
      }
    }
    for (const mod of diff.modifiedNodes) {
      const existing = modifiedMap.get(mod.id)
      if (existing) {
        modifiedMap.set(mod.id, { oldLabel: existing.oldLabel, newLabel: mod.newLabel })
      } else {
        modifiedMap.set(mod.id, { oldLabel: mod.oldLabel, newLabel: mod.newLabel })
      }
    }
    for (const e of diff.addedEdges) {
      const k = edgeKey(e)
      if (removedEdgeSet.has(k)) {
        removedEdgeSet.delete(k)
        removedEdgeMap.delete(k)
      } else {
        addedEdgeSet.add(k)
        addedEdgeMap.set(k, e)
      }
    }
    for (const e of diff.removedEdges) {
      const k = edgeKey(e)
      if (addedEdgeSet.has(k)) {
        addedEdgeSet.delete(k)
        addedEdgeMap.delete(k)
      } else {
        removedEdgeSet.add(k)
        removedEdgeMap.set(k, e)
      }
    }
    for (const c of diff.newContradictions) newContradictions.add(c)
    for (const c of diff.resolvedContradictions) {
      if (newContradictions.has(c)) {
        newContradictions.delete(c)
      } else {
        resolvedContradictions.add(c)
      }
    }
  }

  return {
    addedNodes: [...addedSet],
    removedNodes: [...removedSet],
    modifiedNodes: [...modifiedMap.entries()].map(([id, { oldLabel, newLabel }]) => ({
      id,
      oldLabel,
      newLabel,
    })),
    addedEdges: [...addedEdgeMap.values()],
    removedEdges: [...removedEdgeMap.values()],
    newContradictions: [...newContradictions],
    resolvedContradictions: [...resolvedContradictions],
  }
}

function DiffSection({
  title,
  items,
  variant,
}: {
  title: string
  items: string[]
  variant: 'added' | 'removed' | 'modified'
}) {
  if (items.length === 0) return null
  return (
    <div className="kg-diff-section">
      <h5 className={`kg-diff-section-title kg-diff-${variant}`}>
        {title} ({items.length})
      </h5>
      <ul className="kg-diff-list">
        {items.slice(0, 15).map((item, i) => (
          <li key={i} className={`kg-diff-item kg-diff-${variant}`}>
            {variant === 'added' ? '+' : variant === 'removed' ? '-' : '~'} {item}
          </li>
        ))}
        {items.length > 15 && (
          <li className="kg-diff-item kg-diff-more">+{items.length - 15} more</li>
        )}
      </ul>
    </div>
  )
}

export function KGDiffPanel({ graphHistory, onHighlightDiff }: KGDiffPanelProps) {
  const cycles = useMemo(() => graphHistory.map((h) => h.cycle), [graphHistory])
  const [selectedCycleA, setSelectedCycleA] = useState<number | null>(null)
  const [selectedCycleB, setSelectedCycleB] = useState<number | null>(null)
  const cycleA =
    selectedCycleA !== null && cycles.includes(selectedCycleA)
      ? selectedCycleA
      : cycles.length > 1
        ? cycles[0]
        : (cycles[0] ?? 0)
  const cycleB =
    selectedCycleB !== null && cycles.includes(selectedCycleB)
      ? selectedCycleB
      : (cycles[cycles.length - 1] ?? 0)

  const mergedDiff = useMemo(() => {
    if (cycles.length === 0) return null

    const indexA = graphHistory.findIndex((h) => h.cycle === cycleA)
    const indexB = graphHistory.findIndex((h) => h.cycle === cycleB)
    if (indexA === -1 || indexB === -1) return null

    const start = Math.min(indexA, indexB)
    const end = Math.max(indexA, indexB)
    const diffsInRange = graphHistory.slice(start, end + 1).map((h) => h.diff)

    return mergeDiffs(diffsInRange)
  }, [graphHistory, cycleA, cycleB, cycles.length])

  if (graphHistory.length === 0) {
    return (
      <div className="kg-diff-panel">
        <p className="kg-diff-empty">
          No cycle history yet. Diffs appear after dialectical cycles complete.
        </p>
      </div>
    )
  }

  const totalChanges = mergedDiff
    ? mergedDiff.addedNodes.length +
      mergedDiff.removedNodes.length +
      mergedDiff.modifiedNodes.length +
      mergedDiff.addedEdges.length +
      mergedDiff.removedEdges.length
    : 0

  return (
    <div className="kg-diff-panel">
      <div className="kg-diff-header">
        <h4 className="kg-section-title">Cycle Diff Comparison</h4>
        <div className="kg-diff-controls">
          <label className="kg-diff-select-label">
            From:
            <select
              value={cycleA}
              onChange={(e) => setSelectedCycleA(Number(e.target.value))}
              className="kg-diff-select"
            >
              {cycles.map((c) => (
                <option key={c} value={c}>
                  Cycle {c}
                </option>
              ))}
            </select>
          </label>
          <span className="kg-diff-arrow">→</span>
          <label className="kg-diff-select-label">
            To:
            <select
              value={cycleB}
              onChange={(e) => setSelectedCycleB(Number(e.target.value))}
              className="kg-diff-select"
            >
              {cycles.map((c) => (
                <option key={c} value={c}>
                  Cycle {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {mergedDiff && (
        <div className="kg-diff-body">
          <div className="kg-diff-summary">
            <span className="kg-diff-total">{totalChanges} changes</span>
            <button
              className="ghost-button kg-diff-highlight-btn"
              onClick={() => onHighlightDiff(mergedDiff)}
            >
              Highlight in graph
            </button>
            <button
              className="ghost-button kg-diff-clear-btn"
              onClick={() => onHighlightDiff(null)}
            >
              Clear
            </button>
          </div>

          <div className="kg-diff-columns">
            <div className="kg-diff-column">
              <DiffSection title="Added Nodes" items={mergedDiff.addedNodes} variant="added" />
              <DiffSection
                title="Removed Nodes"
                items={mergedDiff.removedNodes}
                variant="removed"
              />
              <DiffSection
                title="Modified Nodes"
                items={mergedDiff.modifiedNodes.map((m) => `${m.oldLabel} → ${m.newLabel}`)}
                variant="modified"
              />
            </div>
            <div className="kg-diff-column">
              <DiffSection
                title="Added Edges"
                items={mergedDiff.addedEdges.map((e) => `${e.from} →[${e.rel}]→ ${e.to}`)}
                variant="added"
              />
              <DiffSection
                title="Removed Edges"
                items={mergedDiff.removedEdges.map((e) => `${e.from} →[${e.rel}]→ ${e.to}`)}
                variant="removed"
              />
            </div>
          </div>

          {(mergedDiff.newContradictions.length > 0 ||
            mergedDiff.resolvedContradictions.length > 0) && (
            <div className="kg-diff-contradictions">
              {mergedDiff.newContradictions.length > 0 && (
                <span className="kg-delta-badge kg-delta-removed">
                  {mergedDiff.newContradictions.length} new contradictions
                </span>
              )}
              {mergedDiff.resolvedContradictions.length > 0 && (
                <span className="kg-delta-badge kg-delta-added">
                  {mergedDiff.resolvedContradictions.length} resolved
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
