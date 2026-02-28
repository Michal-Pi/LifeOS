/**
 * LabelingInterface Component
 *
 * Human labeling workflow UI for reviewing and labeling agent run outputs.
 * Provides question-based labeling with support for ratings, booleans, categories,
 * and free text responses.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import './LabelingInterface.css'
import type {
  LabelingTask,
  LabelingQuestion,
  LabelingQueue,
  Label,
  ComponentTelemetry,
} from '@lifeos/agents'

// ----- Types -----

export interface LabelingInterfaceProps {
  // Current task
  task: LabelingTask | null
  queue?: LabelingQueue | null

  // Queue stats (optional)
  queueStats?: {
    pending: number
    completed: number
    total: number
  }

  // Callbacks
  onSubmitLabel: (
    taskId: string,
    answers: Record<string, unknown>,
    confidence?: number,
    notes?: string
  ) => Promise<void>
  onSkipTask?: (taskId: string, reason: string) => Promise<void>
  onNextTask?: () => void
  onPreviousTask?: () => void
  onViewTrace?: (taskId: string) => void

  // State
  loading?: boolean
  submitting?: boolean
  error?: string | null

  // Configuration
  labelerId: string
  showTraceSnapshot?: boolean
}

// ----- Helper Components -----

interface QuestionFieldProps {
  question: LabelingQuestion
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

function QuestionField({ question, value, onChange, disabled }: QuestionFieldProps) {
  switch (question.type) {
    case 'boolean':
      return (
        <div className="labeling-boolean" role="radiogroup" aria-label={question.question}>
          <button
            type="button"
            role="radio"
            aria-checked={value === true}
            className={`bool-btn ${value === true ? 'selected yes' : ''}`}
            onClick={() => onChange(true)}
            disabled={disabled}
          >
            <span aria-hidden="true">✓</span> Yes
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={value === false}
            className={`bool-btn ${value === false ? 'selected no' : ''}`}
            onClick={() => onChange(false)}
            disabled={disabled}
          >
            <span aria-hidden="true">✗</span> No
          </button>
        </div>
      )

    case 'rating_1_5':
      return (
        <div className="labeling-rating" role="radiogroup" aria-label={question.question}>
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={value === rating}
              aria-label={`Rating ${rating} of 5`}
              className={`rating-btn ${value === rating ? 'selected' : ''}`}
              onClick={() => onChange(rating)}
              disabled={disabled}
            >
              {rating}
            </button>
          ))}
          <div className="rating-labels" aria-hidden="true">
            <span>Poor</span>
            <span>Excellent</span>
          </div>
        </div>
      )

    case 'rating_1_10':
      return (
        <div className="labeling-rating wide" role="radiogroup" aria-label={question.question}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={value === rating}
              aria-label={`Rating ${rating} of 10`}
              className={`rating-btn ${value === rating ? 'selected' : ''}`}
              onClick={() => onChange(rating)}
              disabled={disabled}
            >
              {rating}
            </button>
          ))}
          <div className="rating-labels" aria-hidden="true">
            <span>Poor</span>
            <span>Excellent</span>
          </div>
        </div>
      )

    case 'category':
      return (
        <div className="labeling-category" role="radiogroup" aria-label={question.question}>
          {question.options?.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={value === option}
              className={`category-btn ${value === option ? 'selected' : ''}`}
              onClick={() => onChange(option)}
              disabled={disabled}
            >
              {option}
            </button>
          ))}
        </div>
      )

    case 'text':
      return (
        <textarea
          className="labeling-textarea"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your response..."
          disabled={disabled}
          rows={3}
          aria-label={question.question}
        />
      )

    default:
      return null
  }
}

interface TraceSnapshotProps {
  trace: ComponentTelemetry[]
}

function TraceSnapshot({ trace }: TraceSnapshotProps) {
  const [expanded, setExpanded] = useState(false)

  const summary = useMemo(() => {
    const routerCount = trace.filter((t) => t.componentType === 'router').length
    const toolCount = trace.filter((t) => t.componentType === 'tool').length
    const memoryCount = trace.filter((t) => t.componentType === 'memory').length
    const totalDuration = trace.reduce((sum, t) => sum + t.durationMs, 0)
    return { routerCount, toolCount, memoryCount, totalDuration }
  }, [trace])

  if (trace.length === 0) return null

  return (
    <div className="trace-snapshot">
      <button
        type="button"
        className="trace-snapshot-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="trace-snapshot-content"
      >
        <span className="trace-snapshot-title">
          <span aria-hidden="true">{expanded ? '▼' : '▶'}</span> Execution Trace
        </span>
        <span className="trace-snapshot-summary">
          {summary.routerCount > 0 && `${summary.routerCount} decisions`}
          {summary.toolCount > 0 && ` · ${summary.toolCount} tools`}
          {summary.memoryCount > 0 && ` · ${summary.memoryCount} memory ops`}
          {` · ${(summary.totalDuration / 1000).toFixed(1)}s`}
        </span>
      </button>
      {expanded && (
        <div id="trace-snapshot-content" className="trace-snapshot-content" role="list">
          {trace.map((t, idx) => (
            <div
              key={t.componentTelemetryId || idx}
              className="trace-snapshot-item"
              role="listitem"
            >
              <span className={`trace-type-badge ${t.componentType}`}>{t.componentType}</span>
              <span className="trace-item-name">{t.componentName || t.componentId}</span>
              {t.routerDecision && (
                <span className="trace-item-detail">
                  <span aria-hidden="true">→</span> {t.routerDecision.chosenPath}
                </span>
              )}
              {t.toolExecution && (
                <span className={`trace-item-detail ${t.toolExecution.success ? '' : 'error'}`}>
                  <span aria-hidden="true">{t.toolExecution.success ? '✓' : '✗'}</span>{' '}
                  {t.toolExecution.toolName}
                  {!t.toolExecution.success && <span className="sr-only"> (failed)</span>}
                </span>
              )}
              {t.memoryOperation && (
                <span className="trace-item-detail">{t.memoryOperation.operationType}</span>
              )}
              <span className="trace-item-duration">{t.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface PreviousLabelsProps {
  labels: Label[]
  questions: LabelingQuestion[]
}

function PreviousLabels({ labels, questions }: PreviousLabelsProps) {
  if (labels.length === 0) return null

  return (
    <div className="previous-labels">
      <h4>Previous Labels ({labels.length})</h4>
      {labels.map((label, idx) => (
        <div key={idx} className="previous-label">
          <div className="label-header">
            <span className="labeler-id">{label.labelerId}</span>
            <span className="label-time">{new Date(label.labeledAtMs).toLocaleString()}</span>
            {label.confidence !== undefined && (
              <span className="label-confidence">
                {Math.round(label.confidence * 100)}% confident
              </span>
            )}
          </div>
          <div className="label-answers">
            {questions.map((q) => (
              <div key={q.questionId} className="label-answer">
                <span className="answer-question">{q.question}</span>
                <span className="answer-value">
                  {formatAnswer(label.answers[q.questionId], q.type)}
                </span>
              </div>
            ))}
          </div>
          {label.notes && <div className="label-notes">{label.notes}</div>}
        </div>
      ))}
    </div>
  )
}

function formatAnswer(value: unknown, type: LabelingQuestion['type']): string {
  if (value === undefined || value === null) return '—'
  switch (type) {
    case 'boolean':
      return value === true ? 'Yes' : 'No'
    case 'rating_1_5':
      return `${value}/5`
    case 'rating_1_10':
      return `${value}/10`
    default:
      return String(value)
  }
}

function TaskExpiryStatus({ expiresAtMs }: { expiresAtMs?: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAtMs) return
    // Set up interval to update current time
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 60000) // Check every minute
    return () => clearInterval(interval)
  }, [expiresAtMs])

  if (!expiresAtMs) return null

  const isExpired = expiresAtMs < now

  return (
    <span className={`expires-at ${isExpired ? 'expired' : ''}`}>
      {isExpired ? 'Expired' : `Expires: ${new Date(expiresAtMs).toLocaleString()}`}
    </span>
  )
}

// ----- Main Component -----

export function LabelingInterface({
  task,
  queue,
  queueStats,
  onSubmitLabel,
  onSkipTask,
  onNextTask,
  onPreviousTask,
  onViewTrace,
  loading,
  submitting,
  error,
  labelerId,
  showTraceSnapshot = true,
}: LabelingInterfaceProps) {
  // Form state
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [confidence, setConfidence] = useState<number | undefined>(undefined)
  const [notes, setNotes] = useState('')
  const [showSkipDialog, setShowSkipDialog] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setAnswers({})
      setConfidence(undefined)
      setNotes('')
      setShowSkipDialog(false)
      setSkipReason('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reset form when task changes, don't trigger on task object reference changes
  }, [task?.taskId])

  // Validation
  const isValid = useMemo(() => {
    if (!task) return false
    return task.questions
      .filter((q) => q.required)
      .every((q) => answers[q.questionId] !== undefined && answers[q.questionId] !== '')
  }, [task, answers])

  // Handlers
  const handleAnswerChange = useCallback((questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!task || !isValid || submitting) return
    await onSubmitLabel(task.taskId, answers, confidence, notes || undefined)
  }, [task, answers, confidence, notes, isValid, submitting, onSubmitLabel])

  const handleSkip = useCallback(async () => {
    if (!task || !onSkipTask) return
    await onSkipTask(task.taskId, skipReason)
    setShowSkipDialog(false)
    setSkipReason('')
  }, [task, skipReason, onSkipTask])

  // Loading state
  if (loading) {
    return (
      <div className="labeling-interface loading">
        <div className="loading-spinner" />
        <p>Loading task...</p>
      </div>
    )
  }

  // Empty state
  if (!task) {
    return (
      <div className="labeling-interface empty">
        <div className="empty-icon">✓</div>
        <h3>No Tasks Pending</h3>
        <p>All labeling tasks have been completed. Great work!</p>
        {queueStats && queueStats.completed > 0 && (
          <div className="empty-stats">
            <span>{queueStats.completed} tasks completed</span>
          </div>
        )}
      </div>
    )
  }

  // Check if already labeled by this user
  const alreadyLabeled = task.labels.some((l) => l.labelerId === labelerId)

  return (
    <div className="labeling-interface">
      {/* Header */}
      <div className="labeling-header">
        <div className="labeling-title">
          <h3>Label Output</h3>
          <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
          <span className={`status-badge ${task.status}`}>{task.status}</span>
        </div>

        <div className="labeling-meta">
          {queue && <span className="queue-name">{queue.name}</span>}
          <span className="workflow-type">{task.workflowType}</span>
          {task.workflowName && <span className="workflow-name">{task.workflowName}</span>}
        </div>

        {queueStats && (
          <div className="queue-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${(queueStats.completed / Math.max(queueStats.total, 1)) * 100}%`,
                }}
              />
            </div>
            <span className="progress-text">
              {queueStats.completed} / {queueStats.total} completed · {queueStats.pending} pending
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && <div className="labeling-error">{error}</div>}

      {/* Already Labeled Warning */}
      {alreadyLabeled && (
        <div className="labeling-warning">You have already submitted a label for this task.</div>
      )}

      {/* Content to Label */}
      <div className="labeling-content">
        <div className="content-section">
          <label>Input</label>
          <div className="content-box input">{task.input}</div>
        </div>

        <div className="content-section">
          <label>Output</label>
          <div className="content-box output">{task.output}</div>
        </div>

        {/* Trace Snapshot */}
        {showTraceSnapshot && task.traceSnapshot && task.traceSnapshot.length > 0 && (
          <TraceSnapshot trace={task.traceSnapshot} />
        )}
      </div>

      {/* Questions */}
      <div className="labeling-questions">
        <h4>Questions</h4>
        {task.questions.map((question) => (
          <div key={question.questionId} className="question-item">
            <div className="question-header">
              <span className="question-text">
                {question.question}
                {question.required && <span className="required">*</span>}
              </span>
              {question.helpText && <span className="question-help">{question.helpText}</span>}
            </div>
            <QuestionField
              question={question}
              value={answers[question.questionId]}
              onChange={(value) => handleAnswerChange(question.questionId, value)}
              disabled={submitting || alreadyLabeled}
            />
          </div>
        ))}
      </div>

      {/* Confidence & Notes */}
      <div className="labeling-extras">
        <div className="confidence-section">
          <label>Your Confidence (optional)</label>
          <div className="confidence-slider">
            <input
              type="range"
              min="0"
              max="100"
              value={confidence !== undefined ? confidence * 100 : 50}
              onChange={(e) => setConfidence(Number(e.target.value) / 100)}
              disabled={submitting || alreadyLabeled}
            />
            <span className="confidence-value">
              {confidence !== undefined ? `${Math.round(confidence * 100)}%` : 'Not set'}
            </span>
          </div>
        </div>

        <div className="notes-section">
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional observations or concerns..."
            disabled={submitting || alreadyLabeled}
            rows={2}
          />
        </div>
      </div>

      {/* Previous Labels */}
      {task.labels.length > 0 && <PreviousLabels labels={task.labels} questions={task.questions} />}

      {/* Actions */}
      <div className="labeling-actions">
        <div className="action-group left">
          {onPreviousTask && (
            <button
              type="button"
              className="action-btn secondary"
              onClick={onPreviousTask}
              disabled={submitting}
            >
              ← Previous
            </button>
          )}
          {onViewTrace && (
            <button
              type="button"
              className="action-btn secondary"
              onClick={() => onViewTrace(task.taskId)}
              disabled={submitting}
            >
              View Full Trace
            </button>
          )}
        </div>

        <div className="action-group right">
          {onSkipTask && (
            <>
              {showSkipDialog ? (
                <div className="skip-dialog">
                  <input
                    type="text"
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    placeholder="Skip reason (optional)"
                  />
                  <button
                    type="button"
                    className="action-btn danger"
                    onClick={handleSkip}
                    disabled={submitting}
                  >
                    Confirm Skip
                  </button>
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={() => setShowSkipDialog(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => setShowSkipDialog(true)}
                  disabled={submitting || alreadyLabeled}
                >
                  Skip
                </button>
              )}
            </>
          )}

          <button
            type="button"
            className="action-btn primary"
            onClick={handleSubmit}
            disabled={!isValid || submitting || alreadyLabeled}
          >
            {submitting ? 'Submitting...' : 'Submit Label'}
          </button>

          {onNextTask && (
            <button
              type="button"
              className="action-btn secondary"
              onClick={onNextTask}
              disabled={submitting}
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {/* Task Metadata */}
      <div className="labeling-footer">
        <span className="task-id">Task: {task.taskId.slice(0, 8)}...</span>
        <span className="run-id">Run: {task.runId.slice(0, 8)}...</span>
        <span className="created-at">Created: {new Date(task.createdAtMs).toLocaleString()}</span>
        <TaskExpiryStatus expiresAtMs={task.expiresAtMs} />
        <span className="labels-count">
          {task.labels.length} / {task.requiredLabels} labels
        </span>
      </div>
    </div>
  )
}

export default LabelingInterface
