/**
 * Intervention Runner Component
 *
 * Executes an intervention step by step.
 * Handles text, timer, choice, and input steps with appropriate UI.
 */

import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import type { CanonicalInterventionPreset } from '@lifeos/mind'
import { Button } from '@/components/ui/button'

interface InterventionRunnerProps {
  intervention: CanonicalInterventionPreset
  onComplete: (responses: Record<string, unknown>) => void
  onCancel: () => void
}

export function InterventionRunner({
  intervention,
  onComplete,
  onCancel,
}: InterventionRunnerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [responses, setResponses] = useState<Record<string, unknown>>({})

  const currentStep = intervention.steps[currentStepIndex]
  const isLastStep = currentStepIndex === intervention.steps.length - 1
  const progress = ((currentStepIndex + 1) / intervention.steps.length) * 100

  // Initialize timer state based on current step (derived state, not effect)
  const initialTimerValue = currentStep?.kind === 'timer' ? currentStep.durationSec : null
  const [timerRemaining, setTimerRemaining] = useState<number | null>(initialTimerValue)

  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete(responses)
    } else {
      setCurrentStepIndex((prev) => prev + 1)
      // Timer will be re-initialized on next render based on new step
    }
  }, [isLastStep, onComplete, responses])

  // Update timer when step index changes
  // This is intentional - we need to sync timer state with currentStep changes
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimerRemaining(currentStep?.kind === 'timer' ? currentStep.durationSec : null)
  }, [currentStepIndex, currentStep])

  // Handle timer countdown
  useEffect(() => {
    if (timerRemaining !== null && timerRemaining > 0) {
      const timer = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev === null || prev <= 1) {
            return null
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [timerRemaining])

  // Auto-advance for text steps with duration
  useEffect(() => {
    if (currentStep?.kind === 'text' && currentStep.durationSec) {
      const timeout = setTimeout(() => {
        handleNext()
      }, currentStep.durationSec * 1000)

      return () => clearTimeout(timeout)
    }
  }, [currentStepIndex, currentStep, handleNext])

  const renderStep = () => {
    switch (currentStep.kind) {
      case 'text':
        return (
          <div className="step-content step-text">
            <p className="step-text-content">{currentStep.content}</p>
            <Button type="button" onClick={handleNext}>
              {isLastStep ? 'Complete' : 'Continue'}
            </Button>
          </div>
        )

      case 'timer':
        return (
          <div className="step-content step-timer">
            <p className="step-timer-instruction">{currentStep.instruction}</p>

            {currentStep.showProgress && timerRemaining !== null && (
              <div className="timer-display">
                <div className="timer-circle">
                  <span className="timer-remaining">{timerRemaining}s</span>
                </div>
                <div className="timer-progress">
                  <div
                    className="timer-progress-bar"
                    style={{
                      width: `${((currentStep.durationSec - timerRemaining) / currentStep.durationSec) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {timerRemaining === null && (
              <Button type="button" onClick={handleNext}>
                {isLastStep ? 'Complete' : 'Continue'}
              </Button>
            )}
          </div>
        )

      case 'choice':
        return (
          <div className="step-content step-choice">
            <p className="section-label">{currentStep.question}</p>
            <div className="choice-options">
              {currentStep.options.map((option, index) => {
                const responseKey = `step_${currentStepIndex}_choice`
                const isSelected = currentStep.allowMultiple
                  ? (responses[responseKey] as string[] | undefined)?.includes(option)
                  : responses[responseKey] === option

                return (
                  <Button
                    variant="ghost"
                    key={index}
                    type="button"
                    onClick={() => {
                      if (currentStep.allowMultiple) {
                        const current = (responses[responseKey] as string[] | undefined) || []
                        const updated = isSelected
                          ? current.filter((o) => o !== option)
                          : [...current, option]
                        setResponses({ ...responses, [responseKey]: updated })
                      } else {
                        setResponses({ ...responses, [responseKey]: option })
                      }
                    }}
                    className={`choice-option ${isSelected ? 'selected' : ''}`}
                  >
                    {option}
                  </Button>
                )
              })}
            </div>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!responses[`step_${currentStepIndex}_choice`]}
            >
              {isLastStep ? 'Complete' : 'Continue'}
            </Button>
          </div>
        )

      case 'input':
        return (
          <div className="step-content step-input">
            <div className="form-group">
              <label htmlFor={`step-input-${currentStepIndex}`}>{currentStep.prompt}</label>
            {currentStep.multiline ? (
              <textarea
                id={`step-input-${currentStepIndex}`}
                placeholder={currentStep.placeholder}
                value={(responses[`step_${currentStepIndex}_input`] as string) || ''}
                onChange={(e) =>
                  setResponses({ ...responses, [`step_${currentStepIndex}_input`]: e.target.value })
                }
                rows={4}
              />
            ) : (
              <input
                id={`step-input-${currentStepIndex}`}
                type="text"
                placeholder={currentStep.placeholder}
                value={(responses[`step_${currentStepIndex}_input`] as string) || ''}
                onChange={(e) =>
                  setResponses({ ...responses, [`step_${currentStepIndex}_input`]: e.target.value })
                }
              />
            )}
            </div>
            <Button
              type="button"
              onClick={handleNext}
              disabled={!responses[`step_${currentStepIndex}_input`]}
            >
              {isLastStep ? 'Complete' : 'Continue'}
            </Button>
          </div>
        )

      default:
        return <p>Unknown step type</p>
    }
  }

  return (
    <div className="intervention-runner">
      <div className="intervention-runner-header">
        <Button variant="ghost" type="button" onClick={onCancel} className="cancel-button">
          ✕
        </Button>
        <h3 className="intervention-runner-title">{intervention.title}</h3>
        <div className="intervention-runner-progress">
          <span className="progress-text">
            Step {currentStepIndex + 1} of {intervention.steps.length}
          </span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="intervention-runner-body">{renderStep()}</div>
    </div>
  )
}
