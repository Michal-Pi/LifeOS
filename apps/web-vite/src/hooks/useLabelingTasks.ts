/**
 * useLabelingTasks Hook
 *
 * Provides access to labeling tasks and queues for human review workflow.
 * Subscribes to real-time updates and provides operations for managing tasks.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import {
  getDefaultLabelingQuestions,
  type LabelingTask,
  type LabelingTaskId,
  type LabelingQueue,
  type LabelingQueueId,
  type LabelingQuestion,
  type ComponentTelemetry,
  type RunId,
} from '@lifeos/agents'

// ----- Types -----

export interface UseLabelingTasksOptions {
  queueId?: LabelingQueueId
  workflowType?: string
  status?: LabelingTask['status']
  limit?: number
}

export interface QueueStats {
  pending: number
  completed: number
  total: number
  inProgress: number
  disputed: number
}

export interface UseLabelingTasksReturn {
  // Data
  tasks: LabelingTask[]
  currentTask: LabelingTask | null
  queues: LabelingQueue[]
  selectedQueue: LabelingQueue | null

  // Stats
  queueStats: QueueStats

  // Loading states
  loading: boolean
  submitting: boolean
  error: string | null

  // Queue operations
  selectQueue: (queueId: LabelingQueueId | null) => void
  createQueue: (input: CreateQueueInput) => Promise<LabelingQueue>
  updateQueue: (queueId: LabelingQueueId, updates: Partial<LabelingQueue>) => Promise<void>

  // Task operations
  selectTask: (taskId: LabelingTaskId | null) => void
  nextTask: () => void
  previousTask: () => void
  submitLabel: (
    taskId: LabelingTaskId,
    answers: Record<string, unknown>,
    confidence?: number,
    notes?: string
  ) => Promise<void>
  skipTask: (taskId: LabelingTaskId, reason: string) => Promise<void>

  // Manual task creation
  createTask: (input: CreateTaskInput) => Promise<LabelingTask>

  // Refresh
  refresh: () => void
}

export interface CreateQueueInput {
  name: string
  description?: string
  workflowType: string
  labelingSchema?: LabelingQuestion[]
  samplingRate?: number
  samplingStrategy?: LabelingQueue['samplingStrategy']
  requiredLabelsPerTask?: number
  defaultPriority?: LabelingTask['priority']
  expirationHours?: number
}

export interface CreateTaskInput {
  runId: RunId
  queueId: LabelingQueueId
  input: string
  output: string
  traceSnapshot?: ComponentTelemetry[]
  workflowType: string
  workflowName?: string
  questions?: LabelingQuestion[]
  priority?: LabelingTask['priority']
}

// ----- Collection Paths -----

function getQueuesPath(userId: string): string {
  return `users/${userId}/evaluation/labelingQueues`
}

function getTasksPath(userId: string): string {
  return `users/${userId}/evaluation/labelingTasks`
}

// ----- Hook Implementation -----

export function useLabelingTasks(options: UseLabelingTasksOptions = {}): UseLabelingTasksReturn {
  const { user } = useAuth()
  const { queueId, workflowType, status, limit: queryLimit = 50 } = options

  // State
  const [tasks, setTasks] = useState<LabelingTask[]>([])
  const [queues, setQueues] = useState<LabelingQueue[]>([])
  const [selectedQueueId, setSelectedQueueId] = useState<LabelingQueueId | null>(queueId || null)
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Subscribe to queues
  useEffect(() => {
    if (!user) {
      setQueues([])
      return
    }

    const db = getFirestoreClient()
    const queuesRef = collection(db, getQueuesPath(user.uid))
    const q = query(queuesRef, where('isActive', '==', true), orderBy('createdAtMs', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextQueues = snapshot.docs.map((d) => d.data() as LabelingQueue)
        setQueues(nextQueues)
      },
      (err) => {
        console.error('Error loading labeling queues:', err)
        setError('Failed to load labeling queues')
      }
    )

    return () => unsubscribe()
  }, [user, refreshTrigger])

  // Subscribe to tasks
  useEffect(() => {
    if (!user) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    const db = getFirestoreClient()
    const tasksRef = collection(db, getTasksPath(user.uid))

    // Build query based on filters
    let q = query(tasksRef)

    if (selectedQueueId) {
      q = query(q, where('queueId', '==', selectedQueueId))
    }

    if (workflowType) {
      q = query(q, where('workflowType', '==', workflowType))
    }

    if (status) {
      q = query(q, where('status', '==', status))
    } else {
      // Default: show pending and in_progress
      q = query(q, where('status', 'in', ['pending', 'in_progress']))
    }

    q = query(q, orderBy('priority', 'desc'), orderBy('createdAtMs', 'asc'), limit(queryLimit))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextTasks = snapshot.docs.map((d) => d.data() as LabelingTask)
        // Sort by priority (urgent > high > medium > low), then by creation time
        const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
        nextTasks.sort((a, b) => {
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
          if (priorityDiff !== 0) return priorityDiff
          return a.createdAtMs - b.createdAtMs
        })
        setTasks(nextTasks)
        setLoading(false)
      },
      (err) => {
        console.error('Error loading labeling tasks:', err)
        setError('Failed to load labeling tasks')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user, selectedQueueId, workflowType, status, queryLimit, refreshTrigger])

  // Derived state
  const selectedQueue = useMemo(() => {
    if (!selectedQueueId) return null
    return queues.find((q) => q.queueId === selectedQueueId) || null
  }, [queues, selectedQueueId])

  const currentTask = useMemo(() => {
    return tasks[selectedTaskIndex] || null
  }, [tasks, selectedTaskIndex])

  const queueStats = useMemo((): QueueStats => {
    const pending = tasks.filter((t) => t.status === 'pending').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const completed = tasks.filter((t) => t.status === 'completed').length
    const disputed = tasks.filter((t) => t.status === 'disputed').length
    return {
      pending,
      inProgress,
      completed,
      disputed,
      total: tasks.length,
    }
  }, [tasks])

  // Queue operations
  const selectQueue = useCallback((id: LabelingQueueId | null) => {
    setSelectedQueueId(id)
    setSelectedTaskIndex(0)
  }, [])

  const createQueue = useCallback(
    async (input: CreateQueueInput): Promise<LabelingQueue> => {
      if (!user) throw new Error('Not authenticated')

      const db = getFirestoreClient()
      const queueId = crypto.randomUUID() as LabelingQueueId
      const now = Date.now()

      const queue: LabelingQueue = {
        queueId,
        userId: user.uid,
        name: input.name,
        description: input.description,
        workflowType: input.workflowType,
        labelingSchema: input.labelingSchema || getDefaultLabelingQuestions(input.workflowType),
        samplingRate: input.samplingRate ?? 0.05,
        samplingStrategy: input.samplingStrategy ?? 'stratified',
        requiredLabelsPerTask: input.requiredLabelsPerTask ?? 1,
        defaultPriority: input.defaultPriority ?? 'medium',
        expirationHours: input.expirationHours,
        isActive: true,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        createdAtMs: now,
        updatedAtMs: now,
      }

      await setDoc(doc(db, getQueuesPath(user.uid), queueId), queue)
      return queue
    },
    [user]
  )

  const updateQueue = useCallback(
    async (id: LabelingQueueId, updates: Partial<LabelingQueue>): Promise<void> => {
      if (!user) throw new Error('Not authenticated')

      const db = getFirestoreClient()
      await updateDoc(doc(db, getQueuesPath(user.uid), id), {
        ...updates,
        updatedAtMs: Date.now(),
      })
    },
    [user]
  )

  // Task operations
  const selectTask = useCallback(
    (taskId: LabelingTaskId | null) => {
      if (!taskId) {
        setSelectedTaskIndex(0)
        return
      }
      const index = tasks.findIndex((t) => t.taskId === taskId)
      if (index >= 0) {
        setSelectedTaskIndex(index)
      }
    },
    [tasks]
  )

  const nextTask = useCallback(() => {
    setSelectedTaskIndex((prev) => Math.min(prev + 1, tasks.length - 1))
  }, [tasks.length])

  const previousTask = useCallback(() => {
    setSelectedTaskIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  const submitLabel = useCallback(
    async (
      taskId: LabelingTaskId,
      answers: Record<string, unknown>,
      confidence?: number,
      notes?: string
    ): Promise<void> => {
      if (!user) throw new Error('Not authenticated')

      setSubmitting(true)
      setError(null)

      try {
        const db = getFirestoreClient()
        const taskRef = doc(db, getTasksPath(user.uid), taskId)
        const taskDoc = await getDoc(taskRef)

        if (!taskDoc.exists()) {
          throw new Error('Task not found')
        }

        const task = taskDoc.data() as LabelingTask

        if (task.status === 'completed' || task.status === 'expired') {
          throw new Error(`Task is already ${task.status}`)
        }

        // Check if already labeled
        if (task.labels.some((l) => l.labelerId === user.uid)) {
          throw new Error('You have already labeled this task')
        }

        const label = {
          labelerId: user.uid,
          answers,
          confidence,
          labeledAtMs: Date.now(),
          durationMs: Date.now() - task.createdAtMs,
          notes,
        }

        const updatedLabels = [...task.labels, label]
        const updates: Partial<LabelingTask> = {
          labels: updatedLabels,
          status: 'in_progress' as const,
        }

        // Check for consensus
        if (updatedLabels.length >= task.requiredLabels) {
          const consensus = computeConsensus(updatedLabels, task.questions)
          updates.consensusReached = consensus.reached
          updates.finalLabels = consensus.finalLabels
          updates.disagreementNotes = consensus.disagreementNotes
          updates.status = consensus.reached ? 'completed' : 'disputed'
          updates.completedAtMs = Date.now()
        }

        await updateDoc(taskRef, updates)

        // Auto-advance to next task
        if (updates.status === 'completed' || updates.status === 'disputed') {
          nextTask()
        }
      } catch (err) {
        console.error('Error submitting label:', err)
        setError(err instanceof Error ? err.message : 'Failed to submit label')
        throw err
      } finally {
        setSubmitting(false)
      }
    },
    [user, nextTask]
  )

  const skipTask = useCallback(
    async (_taskId: LabelingTaskId, _reason: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated')

      // Just move to next task without modifying the task
      // The task remains available for other labelers
      nextTask()
    },
    [user, nextTask]
  )

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<LabelingTask> => {
      if (!user) throw new Error('Not authenticated')

      const db = getFirestoreClient()
      const taskId = crypto.randomUUID() as LabelingTaskId
      const now = Date.now()

      // Get queue for defaults
      const queueRef = doc(db, getQueuesPath(user.uid), input.queueId)
      const queueDoc = await getDoc(queueRef)

      if (!queueDoc.exists()) {
        throw new Error('Queue not found')
      }

      const queue = queueDoc.data() as LabelingQueue

      const task: LabelingTask = {
        taskId,
        runId: input.runId,
        userId: user.uid,
        queueId: input.queueId,
        input: input.input,
        output: input.output,
        traceSnapshot: input.traceSnapshot,
        workflowType: input.workflowType,
        workflowName: input.workflowName,
        questions: input.questions || queue.labelingSchema,
        labels: [],
        status: 'pending',
        requiredLabels: queue.requiredLabelsPerTask,
        consensusReached: false,
        priority: input.priority || queue.defaultPriority,
        createdAtMs: now,
        expiresAtMs: queue.expirationHours
          ? now + queue.expirationHours * 60 * 60 * 1000
          : undefined,
      }

      await setDoc(doc(db, getTasksPath(user.uid), taskId), task)
      return task
    },
    [user]
  )

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  return {
    tasks,
    currentTask,
    queues,
    selectedQueue,
    queueStats,
    loading,
    submitting,
    error,
    selectQueue,
    createQueue,
    updateQueue,
    selectTask,
    nextTask,
    previousTask,
    submitLabel,
    skipTask,
    createTask,
    refresh,
  }
}

// ----- Helper Functions -----

function computeConsensus(
  labels: LabelingTask['labels'],
  questions: LabelingQuestion[]
): { reached: boolean; finalLabels?: Record<string, unknown>; disagreementNotes?: string } {
  const finalLabels: Record<string, unknown> = {}
  const disagreements: string[] = []

  for (const question of questions) {
    const answers = labels.map((l) => l.answers[question.questionId])
    const validAnswers = answers.filter((a) => a !== undefined && a !== null)

    if (validAnswers.length === 0) {
      if (question.required) {
        disagreements.push(`No answers for required question: ${question.question}`)
      }
      continue
    }

    switch (question.type) {
      case 'boolean': {
        const trueCount = validAnswers.filter((a) => a === true).length
        const falseCount = validAnswers.filter((a) => a === false).length
        const majority = trueCount >= falseCount
        const agreement = Math.max(trueCount, falseCount) / validAnswers.length

        if (agreement >= 0.6) {
          finalLabels[question.questionId] = majority
        } else {
          disagreements.push(`Disagreement on: ${question.question}`)
        }
        break
      }

      case 'rating_1_5':
      case 'rating_1_10': {
        const ratings = validAnswers.filter((a): a is number => typeof a === 'number')
        if (ratings.length === 0) break

        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length
        const variance = ratings.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / ratings.length
        const stdDev = Math.sqrt(variance)

        if (stdDev < 1.5) {
          finalLabels[question.questionId] = Math.round(avg * 10) / 10
        } else {
          disagreements.push(`High variance on: ${question.question} (std: ${stdDev.toFixed(2)})`)
        }
        break
      }

      case 'category': {
        const counts = new Map<string, number>()
        for (const answer of validAnswers) {
          const category = String(answer)
          counts.set(category, (counts.get(category) || 0) + 1)
        }

        let maxCount = 0
        let maxCategory = ''
        for (const [category, count] of counts) {
          if (count > maxCount) {
            maxCount = count
            maxCategory = category
          }
        }

        const agreement = maxCount / validAnswers.length
        if (agreement >= 0.5) {
          finalLabels[question.questionId] = maxCategory
        } else {
          disagreements.push(`No majority for: ${question.question}`)
        }
        break
      }

      case 'text': {
        finalLabels[question.questionId] = validAnswers
        break
      }
    }
  }

  return {
    reached: disagreements.length === 0,
    finalLabels: Object.keys(finalLabels).length > 0 ? finalLabels : undefined,
    disagreementNotes: disagreements.length > 0 ? disagreements.join('; ') : undefined,
  }
}

export default useLabelingTasks
