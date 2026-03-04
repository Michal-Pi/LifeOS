/**
 * RunDetailModal Component
 *
 * Unified modal for viewing run messages, final output, and saving as note.
 * Shows the MessageCarousel for all run statuses — live view when running,
 * browsable message history when completed/failed.
 */

import type { Run, Workflow, RunId } from '@lifeos/agents'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { MessageCarousel } from './MessageCarousel'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { useRunEvents } from '@/hooks/useRunEvents'
import { useRunMessages } from '@/hooks/useRunMessages'
import { markdownToJsonContent } from '@/lib/noteImport'

interface RunDetailModalProps {
  run: Run
  workflow: Workflow
  isOpen: boolean
  onClose: () => void
  onProvideInput?: (runId: string, nodeId: string, response: string) => Promise<void>
  onStop?: (runId: string) => Promise<void>
}

export function RunDetailModal({
  run,
  workflow,
  isOpen,
  onClose,
  onProvideInput,
  onStop,
}: RunDetailModalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { createNote } = useNoteOperations()
  const [isSubmittingInput, setIsSubmittingInput] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [isSavingAll, setIsSavingAll] = useState(false)

  // Subscribe to data only while modal is open
  const { messages, hasMore, isLoadingMore, loadMore } = useRunMessages(
    isOpen ? (run.runId as RunId) : ('' as RunId)
  )
  const { events } = useRunEvents(isOpen ? (run.runId as RunId) : ('' as RunId))

  // Compute display output
  const streamingOutput = events
    .filter((event) => event.type === 'token')
    .map((event) => event.delta ?? '')
    .join('')
  const finalEvent = [...events].reverse().find((event) => event.type === 'final')
  const displayOutput = run.output ?? finalEvent?.output ?? (streamingOutput || undefined)

  // Step progress from events
  const stepEvents = events.filter((e) => e.type === 'step_started' || e.type === 'step_completed')
  const latestStep = stepEvents.length > 0 ? stepEvents[stepEvents.length - 1] : undefined
  const completedSteps = events.filter((e) => e.type === 'step_completed')
  const cumulativeCost = completedSteps.reduce(
    (sum, e) => sum + ((e.details?.cumulativeCost as number) ?? 0),
    0
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
        context: {
          source: 'workflow-run',
          workflowId: workflow.workflowId,
          workflowName: workflow.name,
          runId: run.runId,
          goal: run.goal,
        },
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
        context: {
          source: 'workflow-run',
          workflowId: workflow.workflowId,
          workflowName: workflow.name,
          runId: run.runId,
          goal: run.goal,
          isAllMessages: true,
        },
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
                className={`badge-${run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : run.status === 'running' ? 'info' : 'warning'}`}
              >
                {run.status}
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
            onSaveAsNote={handleSaveAsNote}
            onSaveAllAsNote={handleSaveAllAsNote}
            isSavingNote={isSavingNote}
            isSavingAll={isSavingAll}
            isSubmittingInput={isSubmittingInput}
            pendingInput={run.pendingInput}
            agentName={getAgentNameFromMessages()}
          />
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
