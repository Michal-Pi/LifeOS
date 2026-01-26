import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  increment,
  limit,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  PromptLibraryRepository,
  PromptTemplate,
  PromptTemplateId,
  CreatePromptTemplateInput,
  UpdatePromptTemplateInput,
  PromptType,
  PromptCategory,
} from '@lifeos/agents'

const buildFilters = (
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  filters?: { type?: PromptType; category?: PromptCategory; tags?: string[] }
) => {
  const constraints = []
  const baseRef = collection(db, `users/${userId}/promptLibrary`)
  if (filters?.type) {
    constraints.push(where('type', '==', filters.type))
  }
  if (filters?.category) {
    constraints.push(where('category', '==', filters.category))
  }
  if (filters?.tags?.length) {
    constraints.push(where('tags', 'array-contains-any', filters.tags))
  }
  constraints.push(orderBy('updatedAtMs', 'desc'))
  return query(baseRef, ...constraints)
}

export const createFirestorePromptLibraryRepository = (): PromptLibraryRepository => {
  return {
    async create(userId: string, input: CreatePromptTemplateInput): Promise<PromptTemplate> {
      const db = await getDb()
      const templateId = newId('promptTemplate') as PromptTemplateId
      const now = Date.now()

      const template: PromptTemplate = {
        templateId,
        userId,
        name: input.name,
        description: input.description,
        type: input.type,
        category: input.category,
        tags: input.tags ?? [],
        content: input.content,
        version: 1,
        variables: input.variables ?? [],
        usageCount: 0,
        createdAtMs: now,
        updatedAtMs: now,
      }

      const templateRef = doc(db, `users/${userId}/promptLibrary/${templateId}`)
      await setDoc(templateRef, template)

      const versionRef = doc(collection(templateRef, 'versions'), '1')
      await setDoc(versionRef, {
        version: 1,
        content: input.content,
        changeDescription: 'Initial version',
        createdAtMs: now,
        createdBy: userId,
      })

      return template
    },

    async get(userId: string, templateId: PromptTemplateId): Promise<PromptTemplate | null> {
      const db = await getDb()
      const templateRef = doc(db, `users/${userId}/promptLibrary/${templateId}`)
      const snapshot = await getDoc(templateRef)
      if (!snapshot.exists()) return null
      return snapshot.data() as PromptTemplate
    },

    async list(
      userId: string,
      filters?: { type?: PromptType; category?: PromptCategory; tags?: string[] }
    ): Promise<PromptTemplate[]> {
      const db = await getDb()
      const q = buildFilters(db, userId, filters)
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as PromptTemplate)
    },

    async update(
      userId: string,
      templateId: PromptTemplateId,
      updates: UpdatePromptTemplateInput
    ): Promise<PromptTemplate> {
      const db = await getDb()
      const templateRef = doc(db, `users/${userId}/promptLibrary/${templateId}`)
      const snapshot = await getDoc(templateRef)

      if (!snapshot.exists()) {
        throw new Error('Template not found')
      }

      const current = snapshot.data() as PromptTemplate
      const nextVersion = current.version + 1
      const now = Date.now()

      if (updates.content && updates.content !== current.content) {
        const versionRef = doc(collection(templateRef, 'versions'), String(nextVersion))
        await setDoc(versionRef, {
          version: nextVersion,
          content: updates.content,
          changeDescription: updates.changeDescription ?? 'Updated content',
          createdAtMs: now,
          createdBy: userId,
        })
      }

      const updatedPayload = {
        ...updates,
        version: updates.content ? nextVersion : current.version,
        updatedAtMs: now,
      }

      await updateDoc(templateRef, updatedPayload)
      const updatedSnapshot = await getDoc(templateRef)
      return updatedSnapshot.data() as PromptTemplate
    },

    async delete(userId: string, templateId: PromptTemplateId): Promise<void> {
      const db = await getDb()
      const templateRef = doc(db, `users/${userId}/promptLibrary/${templateId}`)
      await deleteDoc(templateRef)
    },

    async getVersion(
      userId: string,
      templateId: PromptTemplateId,
      version: number
    ): Promise<PromptTemplate | null> {
      const db = await getDb()
      const templateRef = doc(db, `users/${userId}/promptLibrary/${templateId}`)
      const snapshot = await getDoc(templateRef)
      if (!snapshot.exists()) return null

      const versionRef = doc(collection(templateRef, 'versions'), String(version))
      const versionSnapshot = await getDoc(versionRef)
      if (!versionSnapshot.exists()) return null

      return {
        ...(snapshot.data() as PromptTemplate),
        version,
        content: versionSnapshot.data()?.content ?? '',
      }
    },

    async restoreVersion(
      userId: string,
      templateId: PromptTemplateId,
      version: number
    ): Promise<PromptTemplate> {
      const db = await getDb()
      const templateRef = doc(db, `users/${userId}/promptLibrary/${templateId}`)
      const snapshot = await getDoc(templateRef)
      if (!snapshot.exists()) {
        throw new Error('Template not found')
      }

      const versionRef = doc(collection(templateRef, 'versions'), String(version))
      const versionSnapshot = await getDoc(versionRef)
      if (!versionSnapshot.exists()) {
        throw new Error('Version not found')
      }

      const now = Date.now()
      const current = snapshot.data() as PromptTemplate
      const nextVersion = current.version + 1
      const content = versionSnapshot.data()?.content ?? ''

      const newVersionRef = doc(collection(templateRef, 'versions'), String(nextVersion))
      await setDoc(newVersionRef, {
        version: nextVersion,
        content,
        changeDescription: `Restored version ${version}`,
        createdAtMs: now,
        createdBy: userId,
      })

      await updateDoc(templateRef, {
        content,
        version: nextVersion,
        updatedAtMs: now,
      })

      const updatedSnapshot = await getDoc(templateRef)
      return updatedSnapshot.data() as PromptTemplate
    },

    async incrementUsage(userId: string, templateId: PromptTemplateId): Promise<void> {
      const db = await getDb()
      const templateRef = doc(db, `users/${userId}/promptLibrary/${templateId}`)
      await updateDoc(templateRef, {
        usageCount: increment(1),
        lastUsedAtMs: Date.now(),
      })
    },

    async getUsageStats(userId: string): Promise<
      Array<{ templateId: PromptTemplateId; name: string; usageCount: number }>
    > {
      const db = await getDb()
      const colRef = collection(db, `users/${userId}/promptLibrary`)
      const q = query(colRef, orderBy('usageCount', 'desc'), orderBy('updatedAtMs', 'desc'), limit(50))
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => {
        const data = doc.data() as PromptTemplate
        return {
          templateId: data.templateId,
          name: data.name,
          usageCount: data.usageCount,
        }
      })
    },
  }
}
