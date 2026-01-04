import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  orderBy,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  WorkspaceRepository,
  Workspace,
  WorkspaceId,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from '@lifeos/agents'

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

      const workspaceDoc = doc(db, `users/${userId}/workspaces/${workspaceId}`)
      await setDoc(workspaceDoc, workspace)

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

      await setDoc(workspaceDoc, updated)
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

      await setDoc(workspaceDoc, updated)
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
