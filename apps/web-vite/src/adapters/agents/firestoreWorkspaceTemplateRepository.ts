import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  WorkspaceTemplateRepository,
  WorkspaceTemplate,
  WorkspaceTemplateId,
  CreateWorkspaceTemplateInput,
} from '@lifeos/agents'

export const createFirestoreWorkspaceTemplateRepository = (): WorkspaceTemplateRepository => {
  return {
    async create(input: CreateWorkspaceTemplateInput): Promise<WorkspaceTemplate> {
      const db = await getDb()
      const templateId = newId('workspaceTemplate') as WorkspaceTemplateId

      const template: WorkspaceTemplate = {
        ...input,
        templateId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      const docRef = doc(db, `users/${input.userId}/workspaceTemplates/${templateId}`)
      await setDoc(docRef, template)
      return template
    },

    async update(
      templateId: WorkspaceTemplateId,
      updates: Partial<CreateWorkspaceTemplateInput>
    ): Promise<WorkspaceTemplate> {
      if (!updates.userId) {
        throw new Error('userId is required to update templates')
      }
      const db = await getDb()
      const docRef = doc(db, `users/${updates.userId}/workspaceTemplates/${templateId}`)
      const snapshot = await getDoc(docRef)
      if (!snapshot.exists()) {
        throw new Error(`Workspace template ${templateId} not found`)
      }

      const updated: WorkspaceTemplate = {
        ...(snapshot.data() as WorkspaceTemplate),
        ...updates,
        updatedAtMs: Date.now(),
      }

      await setDoc(docRef, updated)
      return updated
    },

    async get(userId: string, templateId: WorkspaceTemplateId): Promise<WorkspaceTemplate | null> {
      const db = await getDb()
      const docRef = doc(db, `users/${userId}/workspaceTemplates/${templateId}`)
      const snapshot = await getDoc(docRef)
      if (!snapshot.exists()) return null
      return snapshot.data() as WorkspaceTemplate
    },

    async list(userId: string): Promise<WorkspaceTemplate[]> {
      const db = await getDb()
      const colRef = collection(db, `users/${userId}/workspaceTemplates`)
      const q = query(colRef, orderBy('updatedAtMs', 'desc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as WorkspaceTemplate)
    },

    async delete(userId: string, templateId: WorkspaceTemplateId): Promise<void> {
      const db = await getDb()
      const docRef = doc(db, `users/${userId}/workspaceTemplates/${templateId}`)
      await deleteDoc(docRef)
    },
  }
}
