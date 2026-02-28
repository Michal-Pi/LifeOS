/**
 * Deep Research Usecases
 *
 * Business logic for managing deep research requests.
 */

import type {
  DeepResearchRequest,
  DeepResearchRequestId,
  DeepResearchStatus,
  CreateDeepResearchRequestInput,
  WorkflowId,
  RunId,
} from '../domain/models'
import type { DeepResearchRepository } from '../ports/deepResearchRepository'

const normalizeQuestions = (questions: string[]) =>
  questions.map((question) => question.trim()).filter(Boolean)

const MAX_CONTEXT_BYTES = 100 * 1024

const assertValidResearchContext = (context: CreateDeepResearchRequestInput['context']) => {
  if (context === undefined) return
  try {
    const serialized = JSON.stringify(context)
    if (typeof serialized !== 'string') {
      throw new Error('Context serialization failed')
    }
    const size = new TextEncoder().encode(serialized).length
    if (size > MAX_CONTEXT_BYTES) {
      throw new Error('Context size exceeds limit')
    }
  } catch (_error) {
    throw new Error('Research request context must be JSON-serializable and under 100KB')
  }
}

export function createDeepResearchRequestUsecase(repo: DeepResearchRepository) {
  return async (
    userId: string,
    input: CreateDeepResearchRequestInput
  ): Promise<DeepResearchRequest> => {
    if (!input.topic.trim()) {
      throw new Error('Research topic is required')
    }
    const questions = normalizeQuestions(input.questions)
    if (questions.length === 0) {
      throw new Error('At least one research question is required')
    }
    assertValidResearchContext(input.context)

    return await repo.create(userId, {
      ...input,
      questions,
    })
  }
}

export function updateDeepResearchRequestUsecase(repo: DeepResearchRepository) {
  return async (
    userId: string,
    workflowId: WorkflowId,
    requestId: DeepResearchRequestId,
    updates: Partial<Omit<DeepResearchRequest, 'requestId' | 'userId' | 'workflowId'>>
  ): Promise<DeepResearchRequest> => {
    return await repo.update(userId, workflowId, requestId, updates)
  }
}

export function getDeepResearchRequestUsecase(repo: DeepResearchRepository) {
  return async (
    userId: string,
    workflowId: WorkflowId,
    requestId: DeepResearchRequestId
  ): Promise<DeepResearchRequest | null> => {
    return await repo.get(userId, workflowId, requestId)
  }
}

export function listDeepResearchRequestsUsecase(repo: DeepResearchRepository) {
  return async (
    userId: string,
    options?: {
      workflowId?: WorkflowId
      status?: DeepResearchStatus
      runId?: RunId
      limit?: number
    }
  ): Promise<DeepResearchRequest[]> => {
    return await repo.list(userId, options)
  }
}
