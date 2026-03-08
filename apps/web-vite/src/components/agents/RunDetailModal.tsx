/**
 * RunDetailModal Component
 *
 * Unified modal for viewing run messages, final output, and saving as note.
 * Shows the MessageCarousel for all run statuses — live view when running,
 * browsable message history when completed/failed.
 */

import type { Run, Workflow, RunId } from '@lifeos/agents'
import { lazy, Suspense, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { MessageCarousel } from './MessageCarousel'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { useDeepResearchKGState } from '@/hooks/useDeepResearchKGState'
import { useDialecticalState } from '@/hooks/useDialecticalState'
import { useOracleKGState } from '@/hooks/useOracleKGState'
import { useRunEvents } from '@/hooks/useRunEvents'
import { useRunMessages } from '@/hooks/useRunMessages'
import { markdownToJsonContent } from '@/lib/noteImport'

const KnowledgeGraphVisualization = lazy(() => import('./KnowledgeGraphVisualization'))
const DialecticalCycleVisualization = lazy(() => import('./DialecticalCycleVisualization'))

interface RunDetailModalProps {
  run: Run
  workflow: Workflow
  isOpen: boolean
  onClose: () => void
  onProvideInput?: (runId: string, nodeId: string, response: string) => Promise<void>
  onConstraintResponse?: (
    runId: string,
    action: 'increase' | 'stop',
    newLimit?: number
  ) => Promise<void>
  onStop?: (runId: string) => Promise<void>
}

export function RunDetailModal({
  run,
  workflow,
  isOpen,
  onClose,
  onProvideInput,
  onConstraintResponse,
  onStop,
}: RunDetailModalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { createNote } = useNoteOperations()
  const [isSubmittingInput, setIsSubmittingInput] = useState(false)
  const [isSubmittingConstraint, setIsSubmittingConstraint] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [isSavingAll, setIsSavingAll] = useState(false)

  // Subscribe to data only while modal is open
  const { messages, hasMore, isLoadingMore, loadMore } = useRunMessages(
    isOpen ? (run.runId as RunId) : null
  )
  const { events } = useRunEvents(isOpen ? (run.runId as RunId) : null)

  // Deep research KG state
  const isDeepResearch = workflow.workflowType === 'deep_research'
  const kgState = useDeepResearchKGState(isDeepResearch ? run : null, events)

  // Dialectical state
  const isDialectical = workflow.workflowType === 'dialectical'
  const dialecticalState = useDialecticalState(isDialectical ? run : null, events)

  // Oracle KG state
  const isOracle = workflow.workflowType === 'oracle'
  const oracleKGState = useOracleKGState(isOracle ? run : null, events)

  // Memoize derived values from events to avoid recomputing on every render
  const streamingOutput = useMemo(
    () =>
      events
        .filter((event) => event.type === 'token')
        .map((event) => event.delta ?? '')
        .join(''),
    [events]
  )
  const displayOutput = useMemo(() => {
    const finalEvent = [...events].reverse().find((event) => event.type === 'final')
    return run.output ?? finalEvent?.output ?? (streamingOutput || undefined)
  }, [events, run.output, streamingOutput])

  const stepEvents = useMemo(
    () => events.filter((e) => e.type === 'step_started' || e.type === 'step_completed'),
    [events]
  )
  const latestStep = useMemo(
    () => (stepEvents.length > 0 ? stepEvents[stepEvents.length - 1] : undefined),
    [stepEvents]
  )
  const completedSteps = useMemo(() => events.filter((e) => e.type === 'step_completed'), [events])
  const cumulativeCost = useMemo(
    () =>
      completedSteps.length > 0
        ? Math.max(0, ...completedSteps.map((e) => (e.details?.cumulativeCost as number) ?? 0))
        : 0,
    [completedSteps]
  )

  const getAgentNameFromMessages = () => {
    const lastAssistantMessage = [...messages].reverse().find((msg) => msg.role === 'assistant')
    if (lastAssistantMessage && 'agentId' in lastAssistantMessage) {
      const agentId = lastAssistantMessage.agentId as string
      const agent = workflow.agentIds?.find((id) => id === agentId)
      if (agent) {
        return agentId.split(':')[0] || 'Agent'
      }
    }
    return 'Project Manager'
  }

  const handleSaveAsNote = async (content: string) => {
    if (!content || !user) return

    setIsSavingNote(true)
    try {
      const firstLine = content.split('\n')[0]
      const title = firstLine.length > 100 ? `Run: ${run.goal}` : firstLine || run.goal

      const note = await createNote({
        title,
        content: markdownToJsonContent(content),
        contentHtml: content,
        tags: [`workflow:${workflow.name}`],
      })

      toast.success('Note created!', {
        description: 'Click to view note',
        action: {
          label: 'View',
          onClick: () => navigate(`/notes?noteId=${note.noteId}`),
        },
      })
    } catch (error) {
      toast.error('Failed to create note', {
        description: (error as Error).message,
      })
    } finally {
      setIsSavingNote(false)
    }
  }

  const handleSaveAllAsNote = async (content: string) => {
    if (!content || !user) return

    setIsSavingAll(true)
    try {
      const title = `All Messages: ${run.goal.slice(0, 50)}${run.goal.length > 50 ? '...' : ''}`

      const note = await createNote({
        title,
        content: markdownToJsonContent(content),
        contentHtml: content,
        tags: [`workflow:${workflow.name}`],
      })

      toast.success('All messages saved as note!', {
        description: 'Click to view note',
        action: {
          label: 'View',
          onClick: () => navigate(`/notes?noteId=${note.noteId}`),
        },
      })
    } catch (error) {
      toast.error('Failed to save all messages', {
        description: (error as Error).message,
      })
    } finally {
      setIsSavingAll(false)
    }
  }

  const handleStop = async () => {
    if (!onStop) return
    try {
      await onStop(run.runId)
      toast.success('Run stopped')
    } catch (error) {
      toast.error('Failed to stop run', {
        description: (error as Error).message,
      })
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-detail-heading"
      onClick={onClose}
    >
      <div className="modal-content run-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="run-detail-title">
            <h3 id="run-detail-heading" className="run-detail-goal">
              {run.goal}
            </h3>
            <div className="run-detail-meta">
              <span
                className={`badge ${run.status === 'completed' ? 'badge-success' : run.status === 'failed' ? 'badge-error' : run.status === 'queued' ? 'badge-queued' : run.status === 'running' ? 'badge-info' : run.status === 'waiting_for_input' ? 'badge-waiting' : 'badge-warning'}`}
              >
                {run.status === 'waiting_for_input'
                  ? 'Waiting for Input'
                  : run.status === 'queued'
                    ? 'Queued'
                    : run.status.charAt(0).toUpperCase() + run.status.slice(1)}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <div className="modal-body">
          {run.status === 'running' && latestStep && (
            <div className="run-progress-indicator">
              <span className="run-progress-step">
                Agent {latestStep.step}/{(latestStep.details?.totalSteps as number) || '?'}:{' '}
                {latestStep.agentName}
                {latestStep.type === 'step_started' ? '...' : ' done'}
              </span>
              {cumulativeCost > 0 && (
                <span className="run-progress-cost">${cumulativeCost.toFixed(4)}</span>
              )}
            </div>
          )}
          <MessageCarousel
            run={run}
            events={events}
            messages={messages}
            workflowGraph={workflow.workflowGraph}
            finalOutput={displayOutput}
            onStop={onStop ? handleStop : undefined}
            onProvideInput={
              onProvideInput && run.pendingInput
                ? async (response) => {
                    try {
                      setIsSubmittingInput(true)
                      await onProvideInput(run.runId, run.pendingInput!.nodeId, response)
                    } finally {
                      setIsSubmittingInput(false)
                    }
                  }
                : undefined
            }
            constraintPause={run.constraintPause}
            onConstraintIncrease={
              onConstraintResponse && run.constraintPause
                ? async (newLimit) => {
                    try {
                      setIsSubmittingConstraint(true)
                      await onConstraintResponse(run.runId, 'increase', newLimit)
                    } finally {
                      setIsSubmittingConstraint(false)
                    }
                  }
                : undefined
            }
            onConstraintStop={
              onConstraintResponse && run.constraintPause
                ? async () => {
                    try {
                      setIsSubmittingConstraint(true)
                      await onConstraintResponse(run.runId, 'stop')
                    } finally {
                      setIsSubmittingConstraint(false)
                    }
                  }
                : undefined
            }
            isSubmittingConstraint={isSubmittingConstraint}
            onSaveAsNote={handleSaveAsNote}
            onSaveAllAsNote={handleSaveAllAsNote}
            isSavingNote={isSavingNote}
            isSavingAll={isSavingAll}
            isSubmittingInput={isSubmittingInput}
            pendingInput={run.pendingInput}
            agentName={getAgentNameFromMessages()}
          />

          {isDeepResearch && kgState && (
            <Suspense
              fallback={
                <div
                  style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}
                >
                  Loading knowledge graph...
                </div>
              }
            >
              <KnowledgeGraphVisualization state={kgState} run={run} />
            </Suspense>
          )}

          {isDialectical && dialecticalState && (
            <Suspense
              fallback={
                <div
                  style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}
                >
                  Loading dialectical visualization...
                </div>
              }
            >
              <DialecticalCycleVisualization
                state={dialecticalState}
                velocityThreshold={0.2}
                onTerminate={onStop ? () => onStop(run.runId) : undefined}
              />
            </Suspense>
          )}

          {isOracle && oracleKGState && (
            <Suspense
              fallback={
                <div
                  style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}
                >
                  Loading Oracle knowledge graph...
                </div>
              }
            >
              <KnowledgeGraphVisualization state={oracleKGState} run={run} />
            </Suspense>
          )}
        </div>

        {hasMore && (
          <div className="modal-actions">
            <Button variant="ghost" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Loading...' : 'Load older messages'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
