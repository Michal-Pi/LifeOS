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
  AgentTemplateRepository,
  AgentTemplate,
  AgentTemplateId,
  CreateAgentTemplateInput,
} from '@lifeos/agents'

export const createFirestoreAgentTemplateRepository = (): AgentTemplateRepository => {
  return {
    async create(input: CreateAgentTemplateInput): Promise<AgentTemplate> {
      const db = await getDb()
      const templateId = newId('agentTemplate') as AgentTemplateId

      const template: AgentTemplate = {
        ...input,
        templateId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      const docRef = doc(db, `users/${input.userId}/agentTemplates/${templateId}`)
      await setDoc(docRef, template)
      return template
    },

    async update(
      templateId: AgentTemplateId,
      updates: Partial<CreateAgentTemplateInput>
    ): Promise<AgentTemplate> {
      if (!updates.userId) {
        throw new Error('userId is required to update templates')
      }
      const db = await getDb()
      const docRef = doc(db, `users/${updates.userId}/agentTemplates/${templateId}`)
      const snapshot = await getDoc(docRef)
      if (!snapshot.exists()) {
        throw new Error(`Agent template ${templateId} not found`)
      }

      const updated: AgentTemplate = {
        ...(snapshot.data() as AgentTemplate),
        ...updates,
        updatedAtMs: Date.now(),
      }

      await setDoc(docRef, updated)
      return updated
    },

    async get(userId: string, templateId: AgentTemplateId): Promise<AgentTemplate | null> {
      const db = await getDb()
      const docRef = doc(db, `users/${userId}/agentTemplates/${templateId}`)
      const snapshot = await getDoc(docRef)
      if (!snapshot.exists()) return null
      return snapshot.data() as AgentTemplate
    },

    async list(userId: string): Promise<AgentTemplate[]> {
      const db = await getDb()
      const colRef = collection(db, `users/${userId}/agentTemplates`)
      const q = query(colRef, orderBy('updatedAtMs', 'desc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as AgentTemplate)
    },

    async delete(userId: string, templateId: AgentTemplateId): Promise<void> {
      const db = await getDb()
      const docRef = doc(db, `users/${userId}/agentTemplates/${templateId}`)
      await deleteDoc(docRef)
    },
  }
}
