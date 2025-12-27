import {
  getFirestore,
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
import { newId } from '@lifeos/core'
import type {
  IncantationRepository,
  CanonicalIncantation,
  IncantationId,
  CreateIncantationInput,
  UpdateIncantationInput,
  HabitDomain,
} from '@lifeos/habits'

export const createFirestoreIncantationRepository = (): IncantationRepository => {
  const getFirestoreClient = () => getFirestore()

  return {
    async create(userId: string, input: CreateIncantationInput): Promise<CanonicalIncantation> {
      const db = getFirestoreClient()
      const incantationId = newId('incantation')

      const incantation: CanonicalIncantation = {
        ...input,
        incantationId,
        userId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const incantationDoc = doc(db, `users/${userId}/incantations/${incantationId}`)
      await setDoc(incantationDoc, incantation)

      return incantation
    },

    async update(
      userId: string,
      incantationId: IncantationId,
      updates: UpdateIncantationInput
    ): Promise<CanonicalIncantation> {
      const db = getFirestoreClient()
      const incantationDoc = doc(db, `users/${userId}/incantations/${incantationId}`)

      const existing = await getDoc(incantationDoc)
      if (!existing.exists()) {
        throw new Error(`Incantation ${incantationId} not found`)
      }

      const updated: CanonicalIncantation = {
        ...(existing.data() as CanonicalIncantation),
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(incantationDoc, updated)
      return updated
    },

    async delete(userId: string, incantationId: IncantationId): Promise<void> {
      const db = getFirestoreClient()
      const incantationDoc = doc(db, `users/${userId}/incantations/${incantationId}`)
      await deleteDoc(incantationDoc)
    },

    async get(userId: string, incantationId: IncantationId): Promise<CanonicalIncantation | null> {
      const db = getFirestoreClient()
      const incantationDoc = doc(db, `users/${userId}/incantations/${incantationId}`)
      const snapshot = await getDoc(incantationDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as CanonicalIncantation
    },

    async list(
      userId: string,
      options?: { activeOnly?: boolean; domain?: HabitDomain }
    ): Promise<CanonicalIncantation[]> {
      const db = getFirestoreClient()
      const incantationsCol = collection(db, `users/${userId}/incantations`)

      let q = query(incantationsCol, orderBy('createdAtMs', 'desc'))

      if (options?.activeOnly) {
        q = query(incantationsCol, where('active', '==', true), orderBy('createdAtMs', 'desc'))
      }

      const snapshot = await getDocs(q)
      let incantations = snapshot.docs.map((doc) => doc.data() as CanonicalIncantation)

      // Filter by domain client-side (since domain is an array field)
      if (options?.domain) {
        incantations = incantations.filter(
          (inc) => !inc.domains || inc.domains.length === 0 || inc.domains.includes(options.domain!)
        )
      }

      return incantations
    },
  }
}
