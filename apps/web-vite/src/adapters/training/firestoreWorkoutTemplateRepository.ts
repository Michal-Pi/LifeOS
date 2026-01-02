/**
 * Firestore Workout Template Repository
 *
 * Adapter for workout template persistence in Firestore.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { generateId } from '@lifeos/core'
import type {
  WorkoutTemplate,
  WorkoutTemplateRepository,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateId,
} from '@lifeos/training'

const COLLECTION = 'workoutTemplates'

export function createFirestoreWorkoutTemplateRepository(): WorkoutTemplateRepository {
  return {
    async create(userId: string, input: CreateTemplateInput): Promise<WorkoutTemplate> {
      const now = Date.now()
      const templateId = generateId('template') as TemplateId

      const template: WorkoutTemplate = {
        templateId,
        userId: input.userId,
        title: input.title,
        context: input.context,
        items: input.items,
        createdAtMs: now,
        updatedAtMs: now,
        syncState: 'synced',
        version: 1,
      }

      const db = await getDb()
      const docRef = doc(db, COLLECTION, templateId)
      await updateDoc(docRef, {
        ...template,
        createdAt: Timestamp.fromMillis(now),
        updatedAt: Timestamp.fromMillis(now),
      }).catch(async () => {
        // Document doesn't exist, create it
        await addDoc(collection(db, COLLECTION), {
          ...template,
          createdAt: Timestamp.fromMillis(now),
          updatedAt: Timestamp.fromMillis(now),
        })
      })

      return template
    },

    async update(
      userId: string,
      templateId: TemplateId,
      updates: UpdateTemplateInput
    ): Promise<WorkoutTemplate> {
      const db = await getDb()
      const docRef = doc(db, COLLECTION, templateId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        throw new Error(`Template ${templateId} not found`)
      }

      const existing = docSnap.data() as WorkoutTemplate

      if (existing.userId !== userId) {
        throw new Error('Unauthorized')
      }

      const now = Date.now()
      const updated: WorkoutTemplate = {
        ...existing,
        ...updates,
        updatedAtMs: now,
        version: existing.version + 1,
      }

      await updateDoc(docRef, {
        ...updates,
        updatedAt: Timestamp.fromMillis(now),
        version: updated.version,
      })

      return updated
    },

    async delete(userId: string, templateId: TemplateId): Promise<void> {
      const db = await getDb()
      const docRef = doc(db, COLLECTION, templateId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        throw new Error(`Template ${templateId} not found`)
      }

      const template = docSnap.data() as WorkoutTemplate

      if (template.userId !== userId) {
        throw new Error('Unauthorized')
      }

      await deleteDoc(docRef)
    },

    async get(userId: string, templateId: TemplateId): Promise<WorkoutTemplate | null> {
      const db = await getDb()
      const docRef = doc(db, COLLECTION, templateId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        return null
      }

      const template = docSnap.data() as WorkoutTemplate

      if (template.userId !== userId) {
        throw new Error('Unauthorized')
      }

      return template
    },

    async list(userId: string): Promise<WorkoutTemplate[]> {
      const db = await getDb()
      const q = query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
        orderBy('title', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as WorkoutTemplate)
    },

    async listByContext(userId: string, context: string): Promise<WorkoutTemplate[]> {
      const db = await getDb()
      const q = query(
        collection(db, COLLECTION),
        where('userId', '==', userId),
        where('context', '==', context),
        orderBy('title', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as WorkoutTemplate)
    },
  }
}
