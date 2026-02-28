/**
 * ExecutionReplayControls Component
 *
 * Time-travel debugging overlay for workflow graph execution.
 * Provides a timeline scrubber with step dots, playback controls,
 * and current-step metadata — designed to sit at the bottom of
 * the InteractiveWorkflowGraph container.
 */

import { useMemo } from 'react'
import type { WorkflowStep } from '@lifeos/agents'
import type { ReplaySpeed } from '@/hooks/useExecutionReplay'
import '@/styles/components/ExecutionReplayControls.css'

// ----- Types -----

interface ExecutionReplayControlsProps {
  steps: WorkflowStep[]
  onStepChange: (stepIndex: number) => void
  currentStepIndex: number
  isReplaying: boolean
  onToggleReplay: () => void
  speed?: ReplaySpeed
  onSpeedChange?: (speed: ReplaySpeed) => void
  onStepForward?: () => void
  onStepBack?: () => void
}

type StepStatus = 'completed' | 'running' | 'failed' | 'pending'

// ----- Constants -----

const SPEED_OPTIONS: ReplaySpeed[] = [1, 2, 4]

// ----- Helpers -----

function getStepStatus(step: WorkflowStep): StepStatus {
  if (step.error) return 'failed'
  if (step.completedAtMs) return 'completed'
  return 'running'
}

function formatDuration(ms: number | undefined): string | null {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ----- Component -----

export function ExecutionReplayControls({
  steps,
  onStepChange,
  currentStepIndex,
  isReplaying,
  onToggleReplay,
  speed = 1,
  onSpeedChange,
  onStepForward,
  onStepBack,
}: ExecutionReplayControlsProps) {
  const totalSteps = steps.length

  // Current step data
  const currentStep = steps[currentStepIndex] as WorkflowStep | undefined

  // Timeline fill percentage
  const fillPercent = useMemo(() => {
    if (totalSteps <= 1) return 100
    return (currentStepIndex / (totalSteps - 1)) * 100
  }, [currentStepIndex, totalSteps])

  // Step statuses for dot coloring
  const stepStatuses = useMemo(() => steps.map((step) => getStepStatus(step)), [steps])

  // Derive current step label from nodeId / nodeType
  const stepLabel = currentStep
    ? currentStep.nodeId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '--'

  const duration = currentStep ? formatDuration(currentStep.durationMs) : null

  if (totalSteps === 0) return null

  return (
    <div className="execution-replay">
      {/* Timeline Track */}
      <div
        className="execution-replay__timeline"
        role="slider"
        aria-label="Execution timeline"
        aria-valuemin={0}
        aria-valuemax={totalSteps - 1}
        aria-valuenow={currentStepIndex}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && onStepForward) onStepForward()
          else if (e.key === 'ArrowLeft' && onStepBack) onStepBack()
        }}
      >
        <div className="execution-replay__track">
          <div className="execution-replay__track-fill" style={{ width: `${fillPercent}%` }} />
        </div>

        <div className="execution-replay__dots">
          {steps.map((_, idx) => {
            const status = stepStatuses[idx]
            const isCurrent = idx === currentStepIndex
            const classes = [
              'execution-replay__dot',
              `execution-replay__dot--${status}`,
              isCurrent ? 'execution-replay__dot--current' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={idx}
                className={classes}
                onClick={() => onStepChange(idx)}
                aria-label={`Go to step ${idx + 1}: ${steps[idx].nodeId}`}
                title={`Step ${idx + 1}: ${steps[idx].nodeId} (${status})`}
              />
            )
          })}
        </div>
      </div>

      {/* Controls Row */}
      <div className="execution-replay__controls">
        {/* Playback Buttons */}
        <div className="execution-replay__buttons">
          <button
            className="execution-replay__btn"
            onClick={onStepBack}
            disabled={currentStepIndex <= 0}
            aria-label="Step back"
            title="Step back"
          >
            &#x23EE;
          </button>

          <button
            className="execution-replay__btn execution-replay__btn--play"
            onClick={onToggleReplay}
            disabled={totalSteps <= 1}
            aria-label={isReplaying ? 'Pause replay' : 'Play replay'}
            title={isReplaying ? 'Pause' : 'Play'}
          >
            {isReplaying ? '\u23F8' : '\u25B6'}
          </button>

          <button
            className="execution-replay__btn"
            onClick={onStepForward}
            disabled={currentStepIndex >= totalSteps - 1}
            aria-label="Step forward"
            title="Step forward"
          >
            &#x23ED;
          </button>
        </div>

        {/* Step Info */}
        <div className="execution-replay__info">
          <span className="execution-replay__step-label" title={stepLabel}>
            {stepLabel}
          </span>
          <span className="execution-replay__step-meta">
            Step {currentStepIndex + 1} of {totalSteps}
          </span>
          {duration && <span className="execution-replay__step-duration">{duration}</span>}
        </div>

        {/* Speed Selector */}
        {onSpeedChange && (
          <div className="execution-replay__speed" role="radiogroup" aria-label="Playback speed">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                className={`execution-replay__speed-btn${
                  s === speed ? ' execution-replay__speed-btn--active' : ''
                }`}
                onClick={() => onSpeedChange(s)}
                role="radio"
                aria-checked={s === speed}
                aria-label={`${s}x speed`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ExecutionReplayControls
