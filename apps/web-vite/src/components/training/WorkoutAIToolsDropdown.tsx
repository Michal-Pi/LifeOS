/**
 * Workout AI Tools Dropdown Component
 *
 * A dropdown menu showing available AI workout tools with descriptions.
 * Selecting a tool triggers AI analysis and shows results in a modal.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { WorkoutPlan, ExerciseLibraryItem } from '@lifeos/training'
import { MODEL_PRICING } from '@lifeos/agents'
import { useWorkoutAITools, type WorkoutAIToolType } from '@/hooks/useWorkoutAITools'
import { getEmptyBlocksSummary, countEmptyBlocks } from '@/lib/workoutAITools'
import '@/styles/components/WorkoutAIToolsDropdown.css'

export interface WorkoutAIToolsDropdownProps {
  activePlan: WorkoutPlan | null
  exercises: ExerciseLibraryItem[]
  onPlanCreated: () => void
  onPlanUpdated: () => void
}

interface WorkoutAITool {
  id: WorkoutAIToolType
  name: string
  description: string
  requiresPlan: boolean
}

const WORKOUT_AI_TOOLS: WorkoutAITool[] = [
  {
    id: 'createPlan',
    name: 'Create Workout Plan',
    description: 'Generate a weekly plan based on your goals and availability',
    requiresPlan: false,
  },
  {
    id: 'populateExercises',
    name: 'Populate Exercises',
    description: 'Fill empty blocks with exercises from your library',
    requiresPlan: true,
  },
]

function calculateCost(inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING.default
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

function formatCost(cost: number): string {
  if (cost < 0.001) return '<$0.001'
  return `$${cost.toFixed(4)}`
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function WorkoutAIToolsDropdown({
  activePlan,
  exercises,
  onPlanCreated,
  onPlanUpdated,
}: WorkoutAIToolsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [prompt, setPrompt] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    state,
    runCreatePlan,
    runPopulateExercises,
    setActiveTool,
    clearResults,
    applyGeneratedPlan,
    applyExercisePopulation,
  } = useWorkoutAITools()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleToolSelect = useCallback(
    (toolId: WorkoutAIToolType) => {
      setIsOpen(false)
      setActiveTool(toolId)
      setShowModal(true)
      setPrompt('')
    },
    [setActiveTool]
  )

  const handleSubmit = useCallback(() => {
    if (state.activeTool === 'createPlan') {
      if (!prompt.trim()) return
      void runCreatePlan(prompt)
    } else if (state.activeTool === 'populateExercises' && activePlan) {
      void runPopulateExercises(prompt, activePlan, exercises)
    }
  }, [state.activeTool, prompt, activePlan, exercises, runCreatePlan, runPopulateExercises])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setActiveTool(null)
    clearResults()
    setPrompt('')
  }, [setActiveTool, clearResults])

  const handleApplyPlan = useCallback(async () => {
    const result = await applyGeneratedPlan()
    if (result) {
      onPlanCreated()
      handleCloseModal()
    }
  }, [applyGeneratedPlan, onPlanCreated, handleCloseModal])

  const handleApplyExercises = useCallback(async () => {
    if (!activePlan) return
    const result = await applyExercisePopulation(activePlan)
    if (result) {
      onPlanUpdated()
      handleCloseModal()
    }
  }, [activePlan, applyExercisePopulation, onPlanUpdated, handleCloseModal])

  const getToolName = (toolId: WorkoutAIToolType): string => {
    return WORKOUT_AI_TOOLS.find((t) => t.id === toolId)?.name || 'AI Tool'
  }

  const emptyBlockCount = countEmptyBlocks(activePlan)

  const renderModalContent = () => {
    if (state.isLoading) {
      return (
        <div className="workout-ai-modal__loading">
          <div className="workout-ai-modal__spinner" />
          <p>Generating...</p>
        </div>
      )
    }

    if (state.error) {
      return (
        <div className="workout-ai-modal__error">
          <p>{state.error}</p>
          <button type="button" className="ghost-button small" onClick={handleSubmit}>
            Retry
          </button>
        </div>
      )
    }

    switch (state.activeTool) {
      case 'createPlan':
        return (
          <div className="workout-ai-modal__result">
            <div className="workout-ai-modal__prompt-form">
              <label htmlFor="workout-prompt">Describe your workout goals:</label>
              <textarea
                id="workout-prompt"
                className="workout-ai-modal__prompt-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: I have 45 minutes 4 days a week, focus on strength training at the gym"
                rows={3}
              />
              <div className="workout-ai-modal__prompt-actions">
                <button
                  type="button"
                  className="primary-button small"
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || state.isLoading}
                >
                  {state.generatedPlan ? 'Re-generate' : 'Generate Plan'}
                </button>
              </div>
            </div>

            {state.generatedPlan && (
              <div className="workout-ai-modal__preview">
                <h5>Generated Plan Preview</h5>
                <div className="workout-ai-modal__plan-summary">
                  <span className="workout-ai-modal__plan-context">
                    Context: <strong>{state.generatedPlan.context}</strong>
                  </span>
                  <span className="workout-ai-modal__plan-time">
                    Total: <strong>{state.generatedPlan.totalWeeklyMinutes} min/week</strong>
                  </span>
                </div>
                <p className="workout-ai-modal__plan-description">{state.generatedPlan.summary}</p>

                <div className="workout-ai-modal__schedule">
                  {state.generatedPlan.schedule.map((day) => (
                    <div
                      key={day.dayOfWeek}
                      className={`workout-ai-modal__day ${day.restDay ? 'rest' : ''}`}
                    >
                      <span className="workout-ai-modal__day-name">{DAY_NAMES[day.dayOfWeek]}</span>
                      {day.restDay ? (
                        <span className="workout-ai-modal__day-rest">Rest</span>
                      ) : (
                        <div className="workout-ai-modal__day-blocks">
                          {day.blocks?.map((block, i) => (
                            <span key={i} className="workout-ai-modal__block">
                              {block.category.replace('_', ' ')} ({block.timeMinutes}m)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="workout-ai-modal__apply-actions">
                  <button type="button" className="primary-button" onClick={handleApplyPlan}>
                    Apply Plan
                  </button>
                </div>
              </div>
            )}
          </div>
        )

      case 'populateExercises':
        return (
          <div className="workout-ai-modal__result">
            {emptyBlockCount === 0 ? (
              <div className="workout-ai-modal__empty">
                <p>All blocks in your plan already have exercises assigned.</p>
              </div>
            ) : (
              <>
                <div className="workout-ai-modal__empty-blocks-info">
                  <h5>Blocks to populate ({emptyBlockCount})</h5>
                  <pre className="workout-ai-modal__empty-blocks-list">
                    {getEmptyBlocksSummary(activePlan)}
                  </pre>
                </div>

                <div className="workout-ai-modal__prompt-form">
                  <label htmlFor="exercise-prompt">Exercise preferences (optional):</label>
                  <textarea
                    id="exercise-prompt"
                    className="workout-ai-modal__prompt-input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Example: I prefer compound movements and am training for hypertrophy"
                    rows={2}
                  />
                  <div className="workout-ai-modal__prompt-actions">
                    <button
                      type="button"
                      className="primary-button small"
                      onClick={handleSubmit}
                      disabled={state.isLoading}
                    >
                      {state.populationResult ? 'Re-generate' : 'Populate Exercises'}
                    </button>
                  </div>
                </div>

                {state.populationResult && state.populationResult.updatedBlocks.length > 0 && (
                  <div className="workout-ai-modal__preview">
                    <h5>Suggested Exercises</h5>
                    <p className="workout-ai-modal__plan-description">
                      {state.populationResult.summary}
                    </p>

                    <div className="workout-ai-modal__exercise-updates">
                      {state.populationResult.updatedBlocks.map((update, i) => (
                        <div key={i} className="workout-ai-modal__update-block">
                          <div className="workout-ai-modal__update-header">
                            <strong>{DAY_NAMES[update.dayOfWeek]}</strong>
                            <span className="workout-ai-modal__update-reasoning">
                              {update.reasoning}
                            </span>
                          </div>
                          <div className="workout-ai-modal__update-exercises">
                            {update.exerciseIds.map((exerciseId) => {
                              const exercise = exercises.find((e) => e.exerciseId === exerciseId)
                              return (
                                <span key={exerciseId} className="workout-ai-modal__exercise-pill">
                                  {exercise?.generic_name || exerciseId}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="workout-ai-modal__apply-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleApplyExercises}
                      >
                        Apply Exercises ({state.populationResult.totalExercisesAdded} total)
                      </button>
                    </div>
                  </div>
                )}

                {state.populationResult && state.populationResult.updatedBlocks.length === 0 && (
                  <div className="workout-ai-modal__empty">
                    <p>{state.populationResult.summary}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <>
      <div className="workout-ai-dropdown" ref={dropdownRef}>
        <button
          type="button"
          className="ghost-button workout-ai-dropdown__trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          AI Tools
          <span className="workout-ai-dropdown__caret">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div className="workout-ai-dropdown__menu" role="menu">
            {WORKOUT_AI_TOOLS.map((tool) => {
              const isDisabled = tool.requiresPlan && !activePlan
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitem"
                  className={`workout-ai-dropdown__item ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => !isDisabled && handleToolSelect(tool.id)}
                  disabled={isDisabled}
                >
                  <div className="workout-ai-dropdown__item-content">
                    <span className="workout-ai-dropdown__item-name">{tool.name}</span>
                    <span className="workout-ai-dropdown__item-desc">
                      {isDisabled ? 'Requires an active workout plan' : tool.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Results Modal */}
      {showModal && (
        <div className="workout-ai-modal__overlay" onClick={handleCloseModal}>
          <div className="workout-ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="workout-ai-modal__header">
              <h3>{getToolName(state.activeTool)}</h3>
              <button type="button" className="workout-ai-modal__close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <div className="workout-ai-modal__body">{renderModalContent()}</div>
            {state.usage && !state.isLoading && (
              <div className="workout-ai-modal__footer">
                <span className="workout-ai-modal__usage">
                  {state.usage.inputTokens.toLocaleString()} input +{' '}
                  {state.usage.outputTokens.toLocaleString()} output tokens
                </span>
                <span className="workout-ai-modal__cost">
                  {formatCost(calculateCost(state.usage.inputTokens, state.usage.outputTokens))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
