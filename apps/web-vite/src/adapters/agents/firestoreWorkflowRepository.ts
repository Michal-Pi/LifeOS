import { collection, doc, getDocs, getDoc, setDoc, query, orderBy } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  WorkflowRepository,
  Workflow,
  WorkflowId,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from '@lifeos/agents'

const stripUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        if (entry === undefined) return []
        return [[key, stripUndefined(entry)]]
      })
    ) as T
  }

  return value
}

const collectUndefinedPaths = (value: unknown, path = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectUndefinedPaths(item, path ? `${path}[${index}]` : `[${index}]`)
    )
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => {
      const nextPath = path ? `${path}.${key}` : key
      if (entry === undefined) return [nextPath]
      return collectUndefinedPaths(entry, nextPath)
    })
  }

  return []
}

export const createFirestoreWorkflowRepository = (): WorkflowRepository => {
  return {
    async create(userId: string, input: CreateWorkflowInput): Promise<Workflow> {
      const db = await getDb()
      const workflowId = newId('workflow')

      const workflow: Workflow = {
        ...input,
        workflowId,
        userId,
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      // Remove undefined values before saving to Firestore (deeply, including nested objects/arrays).
      const cleanedWorkflow = stripUndefined(workflow)
      const undefinedPaths = collectUndefinedPaths(workflow)
      if (undefinedPaths.length > 0) {
        console.debug('[WorkflowRepository] Stripped undefined fields from workflow payload', {
          workflowId,
          undefinedPaths,
        })
      }

      const workflowDoc = doc(db, `users/${userId}/workflows/${workflowId}`)
      await setDoc(workflowDoc, cleanedWorkflow)

      return workflow
    },

    async update(
      userId: string,
      workflowId: WorkflowId,
      updates: UpdateWorkflowInput
    ): Promise<Workflow> {
      const db = await getDb()
      const workflowDoc = doc(db, `users/${userId}/workflows/${workflowId}`)

      const existing = await getDoc(workflowDoc)
      if (!existing.exists()) {
        throw new Error(`Workflow ${workflowId} not found`)
      }

      const updated: Workflow = {
        ...(existing.data() as Workflow),
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      // Remove undefined values before saving to Firestore (deeply, including nested objects/arrays).
      const cleanedUpdated = stripUndefined(updated)

      await setDoc(workflowDoc, cleanedUpdated)
      return updated
    },

    async delete(userId: string, workflowId: WorkflowId): Promise<void> {
      const db = await getDb()
      const workflowDoc = doc(db, `users/${userId}/workflows/${workflowId}`)

      const existing = await getDoc(workflowDoc)
      if (!existing.exists()) {
        throw new Error(`Workflow ${workflowId} not found`)
      }

      // Soft delete by marking as archived
      const updated: Workflow = {
        ...(existing.data() as Workflow),
        archived: true,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      // Remove undefined values before saving to Firestore (deeply, including nested objects/arrays).
      const cleanedUpdated = stripUndefined(updated)

      await setDoc(workflowDoc, cleanedUpdated)
    },

    async get(userId: string, workflowId: WorkflowId): Promise<Workflow | null> {
      const db = await getDb()
      const workflowDoc = doc(db, `users/${userId}/workflows/${workflowId}`)
      const snapshot = await getDoc(workflowDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as Workflow
    },

    async list(userId: string, options?: { activeOnly?: boolean }): Promise<Workflow[]> {
      const db = await getDb()
      const workflowsCol = collection(db, `users/${userId}/workflows`)

      const q = query(workflowsCol, orderBy('name', 'asc'))

      const snapshot = await getDocs(q)
      let workflows = snapshot.docs.map((doc) => doc.data() as Workflow)

      // Filter out archived workflows by default
      if (options?.activeOnly !== false) {
        workflows = workflows.filter((workflow) => !workflow.archived)
      }

      return workflows
    },
  }
}
