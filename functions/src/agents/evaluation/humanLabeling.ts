/**
 * Human Labeling Workflow
 *
 * Manages the queue of runs for human review, label collection,
 * and consensus building.
 */

import { getFirestore } from 'firebase-admin/firestore'
import {
  getDefaultLabelingQuestions,
  type LabelingTask,
  type LabelingTaskId,
  type LabelingQueue,
  type LabelingQueueId,
  type LabelingQuestion,
  type Label,
  type ComponentTelemetry,
  type RunId,
} from '@lifeos/agents'
import { randomUUID } from 'crypto'

// ----- Collection Paths -----

const EVALUATION_COLLECTION = 'evaluation'
const LABELING_QUEUES_SUBCOLLECTION = 'labelingQueues'
const LABELING_TASKS_SUBCOLLECTION = 'labelingTasks'

function getLabelingQueuesPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${LABELING_QUEUES_SUBCOLLECTION}`
}

function getLabelingTasksPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${LABELING_TASKS_SUBCOLLECTION}`
}

// ----- Queue Management -----

/**
 * Create a labeling queue
 */
export async function createLabelingQueue(
  userId: string,
  input: Omit<
    LabelingQueue,
    | 'queueId'
    | 'userId'
    | 'totalTasks'
    | 'completedTasks'
    | 'pendingTasks'
    | 'createdAtMs'
    | 'updatedAtMs'
  >
): Promise<LabelingQueue> {
  const db = getFirestore()
  const queueId = randomUUID() as LabelingQueueId
  const now = Date.now()

  const queue: LabelingQueue = {
    ...input,
    queueId,
    userId,
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getLabelingQueuesPath(userId)}/${queueId}`).set(queue)

  return queue
}

/**
 * Get a labeling queue by ID
 */
export async function getLabelingQueue(
  userId: string,
  queueId: LabelingQueueId
): Promise<LabelingQueue | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getLabelingQueuesPath(userId)}/${queueId}`).get()

  if (!doc.exists) return null
  return doc.data() as LabelingQueue
}

/**
 * Get labeling queue by workflow type
 */
export async function getLabelingQueueByWorkflowType(
  userId: string,
  workflowType: string
): Promise<LabelingQueue | null> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getLabelingQueuesPath(userId))
    .where('workflowType', '==', workflowType)
    .where('isActive', '==', true)
    .limit(1)
    .get()

  if (snapshot.empty) return null
  return snapshot.docs[0].data() as LabelingQueue
}

/**
 * List labeling queues
 */
export async function listLabelingQueues(
  userId: string,
  filters?: {
    isActive?: boolean
    workflowType?: string
  }
): Promise<LabelingQueue[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getLabelingQueuesPath(userId))

  if (filters?.isActive !== undefined) {
    query = query.where('isActive', '==', filters.isActive)
  }

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as LabelingQueue)
}

/**
 * Update a labeling queue
 */
export async function updateLabelingQueue(
  userId: string,
  queueId: LabelingQueueId,
  updates: Partial<Omit<LabelingQueue, 'queueId' | 'userId' | 'createdAtMs'>>
): Promise<LabelingQueue> {
  const db = getFirestore()
  const queue = await getLabelingQueue(userId, queueId)

  if (!queue) {
    throw new Error(`Labeling queue ${queueId} not found`)
  }

  const updated = {
    ...queue,
    ...updates,
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getLabelingQueuesPath(userId)}/${queueId}`).set(updated)

  return updated
}

/**
 * Update queue statistics
 */
async function updateQueueStats(userId: string, queueId: LabelingQueueId): Promise<void> {
  const db = getFirestore()

  // Count tasks by status
  const tasksSnapshot = await db
    .collection(getLabelingTasksPath(userId))
    .where('queueId', '==', queueId)
    .get()

  let totalTasks = 0
  let completedTasks = 0
  let pendingTasks = 0

  for (const doc of tasksSnapshot.docs) {
    const task = doc.data() as LabelingTask
    totalTasks++
    if (task.status === 'completed') {
      completedTasks++
    } else if (task.status === 'pending' || task.status === 'in_progress') {
      pendingTasks++
    }
  }

  await db.doc(`${getLabelingQueuesPath(userId)}/${queueId}`).update({
    totalTasks,
    completedTasks,
    pendingTasks,
    updatedAtMs: Date.now(),
  })
}

// ----- Task Management -----

/**
 * Create a labeling task
 */
export async function createLabelingTask(
  userId: string,
  input: {
    runId: RunId
    queueId: LabelingQueueId
    input: string
    output: string
    traceSnapshot?: ComponentTelemetry[]
    workflowType: string
    workflowName?: string
    questions: LabelingQuestion[]
    priority?: LabelingTask['priority']
    expiresAtMs?: number
  }
): Promise<LabelingTask> {
  const db = getFirestore()
  const taskId = randomUUID() as LabelingTaskId
  const now = Date.now()

  // Get queue for defaults
  const queue = await getLabelingQueue(userId, input.queueId)
  if (!queue) {
    throw new Error(`Labeling queue ${input.queueId} not found`)
  }

  const task: LabelingTask = {
    taskId,
    runId: input.runId,
    userId,
    queueId: input.queueId,
    input: input.input,
    output: input.output,
    traceSnapshot: input.traceSnapshot,
    workflowType: input.workflowType,
    workflowName: input.workflowName,
    questions: input.questions.length > 0 ? input.questions : queue.labelingSchema,
    labels: [],
    status: 'pending',
    requiredLabels: queue.requiredLabelsPerTask,
    consensusReached: false,
    priority: input.priority || queue.defaultPriority,
    createdAtMs: now,
    expiresAtMs:
      input.expiresAtMs ||
      (queue.expirationHours ? now + queue.expirationHours * 60 * 60 * 1000 : undefined),
  }

  await db.doc(`${getLabelingTasksPath(userId)}/${taskId}`).set(task)

  // Update queue stats
  await updateQueueStats(userId, input.queueId)

  return task
}

/**
 * Get a labeling task by ID
 */
export async function getLabelingTask(
  userId: string,
  taskId: LabelingTaskId
): Promise<LabelingTask | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getLabelingTasksPath(userId)}/${taskId}`).get()

  if (!doc.exists) return null
  return doc.data() as LabelingTask
}

/**
 * Get labeling task by run ID
 */
export async function getLabelingTaskByRun(
  userId: string,
  runId: RunId
): Promise<LabelingTask | null> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getLabelingTasksPath(userId))
    .where('runId', '==', runId)
    .limit(1)
    .get()

  if (snapshot.empty) return null
  return snapshot.docs[0].data() as LabelingTask
}

/**
 * List labeling tasks
 */
export async function listLabelingTasks(
  userId: string,
  filters?: {
    queueId?: LabelingQueueId
    status?: LabelingTask['status']
    priority?: LabelingTask['priority']
    workflowType?: string
  },
  limit: number = 50
): Promise<LabelingTask[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getLabelingTasksPath(userId))

  if (filters?.queueId) {
    query = query.where('queueId', '==', filters.queueId)
  }

  if (filters?.status) {
    query = query.where('status', '==', filters.status)
  }

  if (filters?.priority) {
    query = query.where('priority', '==', filters.priority)
  }

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  query = query.orderBy('createdAtMs', 'desc').limit(limit)

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as LabelingTask)
}

/**
 * Get next pending task from queue (for labeler assignment)
 */
export async function getNextPendingTask(
  userId: string,
  queueId?: LabelingQueueId
): Promise<LabelingTask | null> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db
    .collection(getLabelingTasksPath(userId))
    .where('status', 'in', ['pending', 'in_progress'])

  if (queueId) {
    query = query.where('queueId', '==', queueId)
  }

  // Prioritize by priority, then by age
  const snapshot = await query
    .orderBy('priority', 'desc')
    .orderBy('createdAtMs', 'asc')
    .limit(10)
    .get()

  if (snapshot.empty) return null

  // Priority order: urgent > high > medium > low
  const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 }
  const tasks = snapshot.docs.map((doc) => doc.data() as LabelingTask)

  // Sort by priority (desc) then by creation time (asc)
  tasks.sort((a, b) => {
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
    if (priorityDiff !== 0) return priorityDiff
    return a.createdAtMs - b.createdAtMs
  })

  return tasks[0] || null
}

// ----- Label Submission -----

/**
 * Submit a label for a task
 */
export async function submitLabel(
  userId: string,
  taskId: LabelingTaskId,
  labelerId: string,
  answers: Record<string, unknown>,
  confidence?: number,
  notes?: string
): Promise<LabelingTask> {
  const db = getFirestore()
  const task = await getLabelingTask(userId, taskId)

  if (!task) {
    throw new Error(`Labeling task ${taskId} not found`)
  }

  if (task.status === 'completed' || task.status === 'expired') {
    throw new Error(`Task ${taskId} is already ${task.status}`)
  }

  // Check if labeler already submitted
  if (task.labels.some((l) => l.labelerId === labelerId)) {
    throw new Error(`Labeler ${labelerId} already submitted a label for this task`)
  }

  const startMs = Date.now()
  const label: Label = {
    labelerId,
    answers,
    confidence,
    labeledAtMs: Date.now(),
    durationMs: startMs - task.createdAtMs, // Time since task was created
    notes,
  }

  const updatedLabels = [...task.labels, label]
  const updates: Partial<LabelingTask> = {
    labels: updatedLabels,
    status: 'in_progress',
  }

  // Check if we have enough labels for consensus
  if (updatedLabels.length >= task.requiredLabels) {
    const consensus = computeConsensus(updatedLabels, task.questions)
    updates.consensusReached = consensus.reached
    updates.finalLabels = consensus.finalLabels
    updates.disagreementNotes = consensus.disagreementNotes
    updates.status = consensus.reached ? 'completed' : 'disputed'
    updates.completedAtMs = Date.now()
  }

  await db.doc(`${getLabelingTasksPath(userId)}/${taskId}`).update(updates)

  // Update queue stats
  await updateQueueStats(userId, task.queueId)

  return { ...task, ...updates }
}

/**
 * Compute consensus from labels
 */
function computeConsensus(
  labels: Label[],
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
        const majority = trueCount >= falseCount ? true : false
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

        // If standard deviation is less than 1.5, use average; otherwise flag disagreement
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
        // For text, just collect all answers
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

// ----- Sampling -----

/**
 * Determine if a run should be queued for labeling based on queue settings
 */
export async function shouldQueueForLabeling(
  userId: string,
  workflowType: string,
  qualityScore?: number,
  consistencyVariance?: number
): Promise<{ shouldQueue: boolean; queueId?: LabelingQueueId; reason?: string }> {
  const queue = await getLabelingQueueByWorkflowType(userId, workflowType)

  if (!queue || !queue.isActive) {
    return { shouldQueue: false }
  }

  // Check sampling strategy
  switch (queue.samplingStrategy) {
    case 'random':
      if (Math.random() < queue.samplingRate) {
        return { shouldQueue: true, queueId: queue.queueId, reason: 'random_sample' }
      }
      break

    case 'low_score':
      if (qualityScore !== undefined && qualityScore < (queue.lowScoreThreshold || 0.5)) {
        return { shouldQueue: true, queueId: queue.queueId, reason: 'low_score' }
      }
      // Also apply random sampling
      if (Math.random() < queue.samplingRate * 0.1) {
        return { shouldQueue: true, queueId: queue.queueId, reason: 'random_sample' }
      }
      break

    case 'high_variance':
      if (consistencyVariance !== undefined && consistencyVariance > 0.3) {
        return { shouldQueue: true, queueId: queue.queueId, reason: 'high_variance' }
      }
      if (Math.random() < queue.samplingRate * 0.1) {
        return { shouldQueue: true, queueId: queue.queueId, reason: 'random_sample' }
      }
      break

    case 'stratified':
      {
        // Stratified: higher probability for edge cases
        let probability = queue.samplingRate
        if (qualityScore !== undefined) {
          // Higher probability for very high or very low scores
          if (qualityScore < 0.3 || qualityScore > 0.9) {
            probability *= 3
          }
        }
        if (Math.random() < probability) {
          return { shouldQueue: true, queueId: queue.queueId, reason: 'stratified_sample' }
        }
        break
      }
      break
  }

  return { shouldQueue: false }
}

// ----- Expiration -----

/**
 * Expire old pending tasks
 */
export async function expirePendingTasks(userId: string): Promise<number> {
  const db = getFirestore()
  const now = Date.now()

  const snapshot = await db
    .collection(getLabelingTasksPath(userId))
    .where('status', 'in', ['pending', 'in_progress'])
    .where('expiresAtMs', '<', now)
    .get()

  let expiredCount = 0
  const batch = db.batch()

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { status: 'expired' })
    expiredCount++
  }

  if (expiredCount > 0) {
    await batch.commit()
  }

  return expiredCount
}

/**
 * Create a default labeling queue for a workflow type
 */
export async function createDefaultLabelingQueue(
  userId: string,
  workflowType: string
): Promise<LabelingQueue> {
  return createLabelingQueue(userId, {
    name: `${workflowType} Labeling Queue`,
    description: `Human labeling queue for ${workflowType} workflow outputs`,
    workflowType,
    labelingSchema: getDefaultLabelingQuestions(workflowType),
    samplingRate: 0.05, // 5% random sampling
    samplingStrategy: 'stratified',
    lowScoreThreshold: 0.4,
    requiredLabelsPerTask: 1, // For personal use, 1 labeler is often enough
    defaultPriority: 'medium',
    expirationHours: 168, // 1 week
    isActive: true,
  })
}
