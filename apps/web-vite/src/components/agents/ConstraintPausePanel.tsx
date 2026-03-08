/**
 * ConstraintPausePanel Component
 *
 * Displays when a workflow hits a budget or iteration constraint.
 * Gives the user the choice to increase the limit and continue, or stop with current results.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Run } from '@lifeos/agents'

type ConstraintPause = NonNullable<Run['constraintPause']>

interface ConstraintPausePanelProps {
  constraintPause: ConstraintPause
  onIncrease: (newLimit: number) => Promise<void>
  onStop: () => Promise<void>
  isSubmitting: boolean
}

const CONSTRAINT_LABELS: Record<string, string> = {
  budget: 'Budget Limit Reached',
  max_node_visits: 'Node Visit Limit Reached',
  max_cycles: 'Cycle Limit Reached',
  max_gap_iterations: 'Gap Iteration Limit Reached',
  max_dialectical_cycles: 'Dialectical Cycle Limit Reached',
  quota_tokens: 'Daily Token Limit Reached',
  quota_cost: 'Daily Cost Limit Reached',
  quota_runs: 'Daily Run Limit Reached',
  rate_runs_per_hour: 'Hourly Run Limit Reached',
  rate_tokens_per_day: 'Daily Token Rate Limit Reached',
  rate_cost_per_day: 'Daily Cost Rate Limit Reached',
}

function formatValue(value: number, unit: string): string {
  if (unit === 'USD') return `$${value.toFixed(2)}`
  return `${value} ${unit}`
}

export function ConstraintPausePanel({
  constraintPause,
  onIncrease,
  onStop,
  isSubmitting,
}: ConstraintPausePanelProps) {
  const [customLimit, setCustomLimit] = useState(
    constraintPause.suggestedIncrease ?? constraintPause.limitValue * 2
  )

  const label = CONSTRAINT_LABELS[constraintPause.constraintType] ?? 'Limit Reached'
  const pct = Math.min(
    100,
    Math.round((constraintPause.currentValue / constraintPause.limitValue) * 100)
  )
  const stopLabel =
    constraintPause.constraintType === 'budget' ||
    constraintPause.constraintType === 'max_gap_iterations' ||
    constraintPause.constraintType === 'max_dialectical_cycles'
      ? 'Finalize with Current Findings'
      : 'Stop & Keep Results'

  return (
    <div className="constraint-pause-panel">
      <div className="constraint-pause-header">
        <div className="constraint-pause-icon">&#x26A0;&#xFE0F;</div>
        <div>
          <h4>{label}</h4>
          <span className="constraint-pause-subtitle">
            {formatValue(constraintPause.currentValue, constraintPause.unit)} /{' '}
            {formatValue(constraintPause.limitValue, constraintPause.unit)} ({pct}%)
          </span>
        </div>
      </div>

      <div className="constraint-progress-bar">
        <div className="constraint-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {constraintPause.partialOutput && (
        <div className="constraint-partial-output">
          <strong>Progress so far:</strong>
          <p>{constraintPause.partialOutput}</p>
        </div>
      )}

      <div className="constraint-increase-row">
        <label htmlFor="constraint-new-limit">Increase limit to:</label>
        <div className="constraint-input-group">
          {constraintPause.unit === 'USD' && <span className="constraint-unit-prefix">$</span>}
          <input
            id="constraint-new-limit"
            type="number"
            value={customLimit}
            onChange={(e) => setCustomLimit(Number(e.target.value))}
            min={constraintPause.limitValue}
            step={constraintPause.unit === 'USD' ? 0.5 : 1}
            disabled={isSubmitting}
            className="constraint-input"
          />
          {constraintPause.unit !== 'USD' && (
            <span className="constraint-unit-suffix">{constraintPause.unit}</span>
          )}
        </div>
      </div>

      <div className="constraint-pause-actions">
        <Button variant="ghost" size="sm" onClick={onStop} disabled={isSubmitting}>
          {stopLabel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onIncrease(customLimit)}
          disabled={isSubmitting || customLimit <= constraintPause.limitValue}
        >
          {isSubmitting ? 'Resuming...' : 'Increase & Continue'}
        </Button>
      </div>
    </div>
  )
}
