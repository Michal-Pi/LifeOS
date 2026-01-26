import { useEffect, useMemo, useState } from 'react'
import type { ExecutionMode, ExpertCouncilConfig } from '@lifeos/agents'
import { calculateCostEstimate } from '@/services/expertCouncil/costEstimator'
import { ModeComparisonTable } from './ModeComparisonTable'
import { CostEstimateCard } from './CostEstimateCard'

interface ExpertCouncilModeSelectorProps {
  config: ExpertCouncilConfig
  onSelect: (mode: ExecutionMode) => void
  initialMode?: ExecutionMode
}

const MODES: ExecutionMode[] = ['full', 'quick', 'single', 'custom']

export function ExpertCouncilModeSelector({
  config,
  onSelect,
  initialMode,
}: ExpertCouncilModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<ExecutionMode>(initialMode ?? config.defaultMode)

  useEffect(() => {
    onSelect(selectedMode)
  }, [onSelect, selectedMode])

  const estimates = useMemo(() => {
    return MODES.reduce(
      (acc, mode) => {
        acc[mode] = calculateCostEstimate(config, mode)
        return acc
      },
      {} as Record<ExecutionMode, ReturnType<typeof calculateCostEstimate>>
    )
  }, [config])

  const selectedEstimate = estimates[selectedMode]

  return (
    <div className="mode-selector">
      <div className="mode-selector-header">
        <div>
          <h3>Select Expert Council Mode</h3>
          <p>Compare cost, time, and quality before running.</p>
        </div>
        {selectedEstimate && (
          <CostEstimateCard estimate={selectedEstimate} budget={config.maxCostPerTurn} />
        )}
      </div>

      <ModeComparisonTable
        selectedMode={selectedMode}
        onSelect={setSelectedMode}
        estimates={estimates}
      />

      <div className="mode-selector-actions">
        <button type="button" className="primary-button" onClick={() => onSelect(selectedMode)}>
          Continue with {selectedMode} mode
        </button>
      </div>
    </div>
  )
}
