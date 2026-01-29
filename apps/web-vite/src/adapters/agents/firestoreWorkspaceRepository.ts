import { collection, doc, getDocs, getDoc, setDoc, query, orderBy } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  WorkspaceRepository,
  Workspace,
  WorkspaceId,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
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

export const createFirestoreWorkspaceRepository = (): WorkspaceRepository => {
  return {
    async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
      const db = await getDb()
      const workspaceId = newId('workspace')

      const workspace: Workspace = {
        ...input,
        workspaceId,
        userId,
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      // Remove undefined values before saving to Firestore (deeply, including nested objects/arrays).
      const cleanedWorkspace = stripUndefined(workspace)
      const undefinedPaths = collectUndefinedPaths(workspace)
      if (undefinedPaths.length > 0) {
        console.warn('[WorkspaceRepository] Stripped undefined fields from workspace payload', {
          workspaceId,
          undefinedPaths,
        })
      }

      const workspaceDoc = doc(db, `users/${userId}/workspaces/${workspaceId}`)
      await setDoc(workspaceDoc, cleanedWorkspace)

      return workspace
    },

    async update(
      userId: string,
      workspaceId: WorkspaceId,
      updates: UpdateWorkspaceInput
    ): Promise<Workspace> {
      const db = await getDb()
      const workspaceDoc = doc(db, `users/${userId}/workspaces/${workspaceId}`)

      const existing = await getDoc(workspaceDoc)
      if (!existing.exists()) {
        throw new Error(`Workspace ${workspaceId} not found`)
      }

      const updated: Workspace = {
        ...(existing.data() as Workspace),
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      // Remove undefined values before saving to Firestore (deeply, including nested objects/arrays).
      const cleanedUpdated = stripUndefined(updated)

      await setDoc(workspaceDoc, cleanedUpdated)
      return updated
    },

    async delete(userId: string, workspaceId: WorkspaceId): Promise<void> {
      const db = await getDb()
      const workspaceDoc = doc(db, `users/${userId}/workspaces/${workspaceId}`)

      const existing = await getDoc(workspaceDoc)
      if (!existing.exists()) {
        throw new Error(`Workspace ${workspaceId} not found`)
      }

      // Soft delete by marking as archived
      const updated: Workspace = {
        ...(existing.data() as Workspace),
        archived: true,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      // Remove undefined values before saving to Firestore (deeply, including nested objects/arrays).
      const cleanedUpdated = stripUndefined(updated)

      await setDoc(workspaceDoc, cleanedUpdated)
    },

    async get(userId: string, workspaceId: WorkspaceId): Promise<Workspace | null> {
      const db = await getDb()
      const workspaceDoc = doc(db, `users/${userId}/workspaces/${workspaceId}`)
      const snapshot = await getDoc(workspaceDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as Workspace
    },

    async list(userId: string, options?: { activeOnly?: boolean }): Promise<Workspace[]> {
      const db = await getDb()
      const workspacesCol = collection(db, `users/${userId}/workspaces`)

      const q = query(workspacesCol, orderBy('name', 'asc'))

      const snapshot = await getDocs(q)
      let workspaces = snapshot.docs.map((doc) => doc.data() as Workspace)

      // Filter out archived workspaces by default
      if (options?.activeOnly !== false) {
        workspaces = workspaces.filter((workspace) => !workspace.archived)
      }

      return workspaces
    },
  }
}
