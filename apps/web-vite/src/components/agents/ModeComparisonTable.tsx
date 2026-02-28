import type { ExecutionMode } from '@lifeos/agents'
import type { CostEstimate } from '@/services/expertCouncil/costEstimator'

type ModeRow = {
  mode: ExecutionMode
  label: string
  description: string
  stages: string[]
}

const MODE_ROWS: ModeRow[] = [
  {
    mode: 'full',
    label: 'Full',
    description: 'Complete 3-stage pipeline with peer review.',
    stages: ['Stage 1: Opinions', 'Stage 2: Peer Review', 'Stage 3: Synthesis'],
  },
  {
    mode: 'quick',
    label: 'Quick',
    description: 'Skip peer review for faster results.',
    stages: ['Stage 1: Opinions', 'Stage 3: Synthesis'],
  },
  {
    mode: 'single',
    label: 'Single',
    description: 'Gather multiple opinions only.',
    stages: ['Stage 1: Opinions'],
  },
  {
    mode: 'custom',
    label: 'Custom',
    description: 'Workflow-specific blend of stages.',
    stages: ['Stage 1: Opinions', 'Stage 2: Peer Review', 'Stage 3: Synthesis'],
  },
]

interface ModeComparisonTableProps {
  selectedMode: ExecutionMode
  onSelect: (mode: ExecutionMode) => void
  estimates: Partial<Record<ExecutionMode, CostEstimate>>
}

export function ModeComparisonTable({
  selectedMode,
  onSelect,
  estimates,
}: ModeComparisonTableProps) {
  return (
    <table className="mode-table">
      <thead>
        <tr>
          <th>Mode</th>
          <th>Stages</th>
          <th>Est. Cost</th>
          <th>Est. Time</th>
          <th>Quality</th>
        </tr>
      </thead>
      <tbody>
        {MODE_ROWS.map((row) => {
          const estimate = estimates[row.mode]
          const isSelected = selectedMode === row.mode
          return (
            <tr
              key={row.mode}
              className={`mode-row ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(row.mode)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(row.mode)
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
            >
              <td>
                <div className="mode-name">{row.label}</div>
                <div className="mode-description">{row.description}</div>
              </td>
              <td>
                <div className="stages-list">
                  {row.stages.map((stage) => (
                    <div key={stage}>{stage}</div>
                  ))}
                </div>
              </td>
              <td>
                <span className="cost-badge">
                  {estimate ? `$${estimate.totalCost.toFixed(2)}` : 'n/a'}
                </span>
              </td>
              <td>
                <span className="time-badge">
                  {estimate ? `${estimate.estimatedTimeSeconds}s` : 'n/a'}
                </span>
              </td>
              <td>
                <div className="quality-bar">
                  <div
                    className="quality-fill"
                    style={{ width: `${estimate?.qualityScore ?? 0}%` }}
                  />
                </div>
                <div className="quality-label">{estimate?.qualityScore ?? 0}%</div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
