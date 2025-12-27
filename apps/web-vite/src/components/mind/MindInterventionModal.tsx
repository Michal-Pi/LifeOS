/**
 * Mind Intervention Modal Component
 *
 * Main orchestrator for the Mind Engine intervention flow.
 * Manages the state machine: FeelingSelector -> InterventionSelector -> InterventionRunner -> SessionComplete
 */

import { useState } from 'react'
import { FeelingSelector } from './FeelingSelector'
import { InterventionSelector } from './InterventionSelector'
import { InterventionRunner } from './InterventionRunner'
import { SessionComplete } from './SessionComplete'
import { useMindInterventions } from '@/hooks/useMindInterventions'
import type { FeelingState, CanonicalInterventionPreset, SessionId } from '@lifeos/mind'

interface MindInterventionModalProps {
  isOpen: boolean
  onClose: () => void
  dateKey: string
  trigger?: 'manual' | 'calendar_alert' | 'today_prompt'
}

type FlowState =
  | { step: 'feeling' }
  | { step: 'selector'; feeling: FeelingState }
  | {
      step: 'running'
      feeling: FeelingState
      intervention: CanonicalInterventionPreset
      sessionId: SessionId
    }
  | {
      step: 'complete'
      feeling: FeelingState
      intervention: CanonicalInterventionPreset
      sessionId: SessionId
      responses: Record<string, unknown>
    }

export function MindInterventionModal({
  isOpen,
  onClose,
  dateKey,
  trigger = 'manual',
}: MindInterventionModalProps) {
  const { startSession, completeSession } = useMindInterventions()
  const [flowState, setFlowState] = useState<FlowState>({ step: 'feeling' })

  if (!isOpen) {
    return null
  }

  const handleFeelingSelect = (feeling: FeelingState) => {
    setFlowState({ step: 'selector', feeling })
  }

  const handleInterventionSelect = async (intervention: CanonicalInterventionPreset) => {
    if (flowState.step !== 'selector') return

    try {
      // Start a new session
      const session = await startSession({
        userId: '', // Will be filled by hook
        interventionId: intervention.interventionId,
        dateKey,
        trigger,
        feelingBefore: flowState.feeling,
      })

      setFlowState({
        step: 'running',
        feeling: flowState.feeling,
        intervention,
        sessionId: session.sessionId,
      })
    } catch (error) {
      console.error('Failed to start intervention session:', error)
    }
  }

  const handleInterventionComplete = (responses: Record<string, unknown>) => {
    if (flowState.step !== 'running') return

    setFlowState({
      step: 'complete',
      feeling: flowState.feeling,
      intervention: flowState.intervention,
      sessionId: flowState.sessionId,
      responses,
    })
  }

  const handleSessionFinish = async (feelingAfter?: FeelingState, createTodo?: boolean) => {
    if (flowState.step !== 'complete') return

    try {
      await completeSession(flowState.sessionId, {
        sessionId: flowState.sessionId,
        feelingAfter,
        responses: flowState.responses,
        createdTodoId: createTodo ? 'TODO_INTEGRATION' : undefined, // TODO: Integrate with todo creation
      })

      // Close modal and reset state
      setFlowState({ step: 'feeling' })
      onClose()
    } catch (error) {
      console.error('Failed to complete intervention session:', error)
    }
  }

  const handleCancel = () => {
    setFlowState({ step: 'feeling' })
    onClose()
  }

  const handleBack = () => {
    if (flowState.step === 'selector') {
      setFlowState({ step: 'feeling' })
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content mind-intervention-modal" onClick={(e) => e.stopPropagation()}>
        {flowState.step === 'feeling' && (
          <FeelingSelector onSelect={handleFeelingSelect} />
        )}

        {flowState.step === 'selector' && (
          <InterventionSelector
            feeling={flowState.feeling}
            onSelect={handleInterventionSelect}
            onBack={handleBack}
          />
        )}

        {flowState.step === 'running' && (
          <InterventionRunner
            intervention={flowState.intervention}
            onComplete={handleInterventionComplete}
            onCancel={handleCancel}
          />
        )}

        {flowState.step === 'complete' && (
          <SessionComplete
            onFinish={handleSessionFinish}
          />
        )}
      </div>
    </div>
  )
}
