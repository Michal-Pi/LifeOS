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
  WorkflowTemplateRepository,
  WorkflowTemplate,
  WorkflowTemplateId,
  CreateWorkflowTemplateInput,
} from '@lifeos/agents'

export const createFirestoreWorkflowTemplateRepository = (): WorkflowTemplateRepository => {
  return {
    async create(input: CreateWorkflowTemplateInput): Promise<WorkflowTemplate> {
      const db = await getDb()
      const templateId = newId('workflowTemplate') as WorkflowTemplateId

      const template: WorkflowTemplate = {
        ...input,
        templateId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      const docRef = doc(db, `users/${input.userId}/workflowTemplates/${templateId}`)
      await setDoc(docRef, template)
      return template
    },

    async update(
      templateId: WorkflowTemplateId,
      updates: Partial<CreateWorkflowTemplateInput>
    ): Promise<WorkflowTemplate> {
      if (!updates.userId) {
        throw new Error('userId is required to update templates')
      }
      const db = await getDb()
      const docRef = doc(db, `users/${updates.userId}/workflowTemplates/${templateId}`)
      const snapshot = await getDoc(docRef)
      if (!snapshot.exists()) {
        throw new Error(`Workflow template ${templateId} not found`)
      }

      const updated: WorkflowTemplate = {
        ...(snapshot.data() as WorkflowTemplate),
        ...updates,
        updatedAtMs: Date.now(),
      }

      await setDoc(docRef, updated)
      return updated
    },

    async get(userId: string, templateId: WorkflowTemplateId): Promise<WorkflowTemplate | null> {
      const db = await getDb()
      const docRef = doc(db, `users/${userId}/workflowTemplates/${templateId}`)
      const snapshot = await getDoc(docRef)
      if (!snapshot.exists()) return null
      return snapshot.data() as WorkflowTemplate
    },

    async list(userId: string): Promise<WorkflowTemplate[]> {
      const db = await getDb()
      const colRef = collection(db, `users/${userId}/workflowTemplates`)
      const q = query(colRef, orderBy('updatedAtMs', 'desc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as WorkflowTemplate)
    },

    async delete(userId: string, templateId: WorkflowTemplateId): Promise<void> {
      const db = await getDb()
      const docRef = doc(db, `users/${userId}/workflowTemplates/${templateId}`)
      await deleteDoc(docRef)
    },
  }
}
