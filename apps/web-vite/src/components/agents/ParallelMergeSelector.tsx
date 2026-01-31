/**
 * ParallelMergeSelector Component
 *
 * Radio-card grid for selecting how parallel agent outputs are merged.
 */

import type { AgentConfig, JoinAggregationMode } from '@lifeos/agents'
import './ParallelMergeSelector.css'

interface ParallelMergeSelectorProps {
  value: JoinAggregationMode
  onChange: (mode: JoinAggregationMode) => void
  selectedAgents?: AgentConfig[]
}

const MERGE_OPTIONS = [
  {
    value: 'list' as JoinAggregationMode,
    label: 'Combine',
    description: 'Concatenate all agent outputs in order (top-to-bottom)',
  },
  {
    value: 'ranked' as JoinAggregationMode,
    label: 'Pick Best',
    description: 'Expert Council selects the single best response',
  },
  {
    value: 'synthesize' as JoinAggregationMode,
    label: 'Synthesize',
    description: 'A Synthesizer agent merges all outputs into the best possible result',
  },
  {
    value: 'dedup_combine' as JoinAggregationMode,
    label: 'Deduplicate Combine',
    description: 'Combine only unique results, preserving original order',
  },
]

export function ParallelMergeSelector({
  value,
  onChange,
  selectedAgents,
}: ParallelMergeSelectorProps) {
  const synthesizerCount = selectedAgents?.filter((a) => a.role === 'synthesizer').length ?? 0

  return (
    <div className="merge-selector">
      {MERGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`merge-option ${value === option.value ? 'merge-option--selected' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <div className="merge-option__label">{option.label}</div>
          <div className="merge-option__description">{option.description}</div>
        </button>
      ))}
      {value === 'synthesize' && synthesizerCount === 0 && (
        <div className="merge-selector__warning">
          Requires exactly one Synthesizer agent. Add a Synthesizer to the selected agents above.
        </div>
      )}
      {value === 'synthesize' && synthesizerCount > 1 && (
        <div className="merge-selector__warning">
          Requires exactly one Synthesizer agent — {synthesizerCount} are currently selected.
        </div>
      )}
      {value === 'synthesize' && synthesizerCount === 1 && (
        <div className="merge-selector__hint">
          The prompt is sent to each agent. The Synthesizer receives all outputs and produces the
          final result.
        </div>
      )}
      {value !== 'synthesize' && (
        <div className="merge-selector__hint">
          The prompt (combined with each agent's own prompt) is sent to every selected agent in
          parallel.
        </div>
      )}
    </div>
  )
}
