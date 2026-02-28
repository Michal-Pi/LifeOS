import { collection, doc, getDocs, getDoc, setDoc, query, where } from 'firebase/firestore'
import { newId } from '@lifeos/core'
import { getFirestoreClient } from '@/lib/firestoreClient'
import type {
  ExerciseLibraryRepository,
  ExerciseLibraryItem,
  ExerciseId,
  CreateExerciseInput,
  UpdateExerciseInput,
  ExerciseCategory,
  ExerciseTypeCategory,
} from '@lifeos/training'

export const createFirestoreExerciseLibraryRepository = (): ExerciseLibraryRepository => {
  return {
    async create(userId: string, input: CreateExerciseInput): Promise<ExerciseLibraryItem> {
      // Validate required fields
      if (!input.generic_name && !input.name) {
        throw new Error('Exercise must have a generic_name or name')
      }

      const db = await getFirestoreClient()
      const exerciseId = newId('exercise')

      const exercise: ExerciseLibraryItem = {
        ...input,
        exerciseId,
        userId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const exerciseDoc = doc(db, `users/${userId}/exerciseLibrary/${exerciseId}`)
      await setDoc(exerciseDoc, exercise)

      return exercise
    },

    async update(
      userId: string,
      exerciseId: ExerciseId,
      updates: UpdateExerciseInput
    ): Promise<ExerciseLibraryItem> {
      const db = await getFirestoreClient()
      const exerciseDoc = doc(db, `users/${userId}/exerciseLibrary/${exerciseId}`)

      const existing = await getDoc(exerciseDoc)
      if (!existing.exists()) {
        throw new Error(`Exercise ${exerciseId} not found`)
      }

      const updated: ExerciseLibraryItem = {
        ...(existing.data() as ExerciseLibraryItem),
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(exerciseDoc, updated)
      return updated
    },

    async delete(userId: string, exerciseId: ExerciseId): Promise<void> {
      const db = await getFirestoreClient()
      const exerciseDoc = doc(db, `users/${userId}/exerciseLibrary/${exerciseId}`)

      const existing = await getDoc(exerciseDoc)
      if (!existing.exists()) {
        throw new Error(`Exercise ${exerciseId} not found`)
      }

      // Soft delete by marking as archived
      const updated: ExerciseLibraryItem = {
        ...(existing.data() as ExerciseLibraryItem),
        archived: true,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(exerciseDoc, updated)
    },

    async get(userId: string, exerciseId: ExerciseId): Promise<ExerciseLibraryItem | null> {
      const db = await getFirestoreClient()
      const exerciseDoc = doc(db, `users/${userId}/exerciseLibrary/${exerciseId}`)
      const snapshot = await getDoc(exerciseDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as ExerciseLibraryItem
    },

    async list(
      userId: string,
      options?: {
        category?: ExerciseTypeCategory
        legacyCategory?: ExerciseCategory
        activeOnly?: boolean
      }
    ): Promise<ExerciseLibraryItem[]> {
      const db = await getFirestoreClient()
      const exercisesCol = collection(db, `users/${userId}/exerciseLibrary`)

      // Start with base query - no ordering to support both old and new schemas
      let q = query(exercisesCol)

      // Filter by new category if specified
      if (options?.category) {
        q = query(exercisesCol, where('category', '==', options.category))
      }
      // Filter by legacy category if specified (for backwards compatibility)
      else if (options?.legacyCategory) {
        q = query(exercisesCol, where('legacyCategory', '==', options.legacyCategory))
      }

      const snapshot = await getDocs(q)
      let exercises = snapshot.docs.map((doc) => doc.data() as ExerciseLibraryItem)

      // Filter out archived exercises by default
      if (options?.activeOnly !== false) {
        exercises = exercises.filter((exercise) => !exercise.archived)
      }

      // Filter out stale exercises without a valid name
      exercises = exercises.filter((exercise) => exercise.generic_name || exercise.name)

      // Sort by generic_name (new schema) or name (old schema)
      exercises.sort((a, b) => {
        const nameA = String(a.generic_name ?? a.name ?? '')
        const nameB = String(b.generic_name ?? b.name ?? '')
        return nameA.localeCompare(nameB)
      })

      return exercises
    },
  }
}
