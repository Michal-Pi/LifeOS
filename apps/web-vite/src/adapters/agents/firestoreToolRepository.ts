import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type { ToolRepository, ToolDefinition, ToolId, CreateToolInput } from '@lifeos/agents'

export const createFirestoreToolRepository = (): ToolRepository => {
  return {
    async create(input: CreateToolInput): Promise<ToolDefinition> {
      if (!input.userId) {
        throw new Error('userId is required to create custom tools')
      }
      const db = await getDb()
      const toolId = newId('tool')

      const tool: ToolDefinition = {
        ...input,
        toolId,
        source: input.source ?? 'custom',
        createdAtMs: input.createdAtMs ?? Date.now(),
        updatedAtMs: input.updatedAtMs ?? Date.now(),
      }

      const toolDoc = doc(db, `users/${input.userId}/tools/${toolId}`)
      await setDoc(toolDoc, tool)

      return tool
    },

    async update(toolId: ToolId, updates: Partial<CreateToolInput>): Promise<ToolDefinition> {
      if (!updates.userId) {
        throw new Error('userId is required to update tools')
      }
      const db = await getDb()
      const toolDoc = doc(db, `users/${updates.userId}/tools/${toolId}`)

      const existing = await getDoc(toolDoc)
      if (!existing.exists()) {
        throw new Error(`Tool ${toolId} not found`)
      }

      const updated: ToolDefinition = {
        ...(existing.data() as ToolDefinition),
        ...updates,
        updatedAtMs: Date.now(),
      }

      await setDoc(toolDoc, updated)
      return updated
    },

    async get(userId: string, toolId: ToolId): Promise<ToolDefinition | null> {
      const db = await getDb()
      const toolDoc = doc(db, `users/${userId}/tools/${toolId}`)
      const snapshot = await getDoc(toolDoc)
      if (!snapshot.exists()) return null
      return snapshot.data() as ToolDefinition
    },

    async list(options?: { userId?: string; module?: string }): Promise<ToolDefinition[]> {
      if (!options?.userId) {
        return []
      }
      const db = await getDb()

      const toolsCol = collection(db, `users/${options.userId}/tools`)
      let q = query(toolsCol, orderBy('updatedAtMs', 'desc'))

      if (options.module) {
        q = query(toolsCol, where('allowedModules', 'array-contains', options.module))
      }

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as ToolDefinition)
    },

    async delete(userId: string, toolId: ToolId): Promise<void> {
      const db = await getDb()
      const toolDoc = doc(db, `users/${userId}/tools/${toolId}`)
      await deleteDoc(toolDoc)
    },
  }
}
