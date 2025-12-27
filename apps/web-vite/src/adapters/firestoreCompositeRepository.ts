import type { CompositeEvent, CompositeEventRepository } from '@lifeos/calendar'
import { createLogger } from '@lifeos/calendar'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
  type Firestore,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'

const logger = createLogger('CompositeRepository')

function compositeCollection(db: Firestore, userId: string) {
  return collection(db, 'users', userId, 'compositeEvents')
}

/**
 * Validates that the data has required fields for CompositeEvent
 */
function validateCompositeData(data: DocumentData, compositeId: string): data is CompositeEvent {
  const requiredFields = ['compositeEventId', 'title', 'members']
  for (const field of requiredFields) {
    if (data[field] === undefined && field !== 'compositeEventId') {
      logger.warn('Missing required field in composite', { field, compositeId })
      return false
    }
  }
  if (!Array.isArray(data.members)) {
    logger.warn('Invalid members field in composite', {
      compositeId,
      membersType: typeof data.members,
    })
    return false
  }
  return true
}

function mapSnapshot(snapshot: QuerySnapshot<DocumentData>): CompositeEvent[] {
  return snapshot.docs
    .map((d) => {
      const data = d.data()
      const composite = {
        ...data,
        compositeEventId: d.id,
      }
      if (!validateCompositeData(composite, d.id)) {
        return null
      }
      return composite as CompositeEvent
    })
    .filter(Boolean) as CompositeEvent[]
}

export function createFirestoreCompositeRepository(): CompositeEventRepository {
  return {
    async getById(userId, compositeEventId) {
      const db = await getDb()
      const reference = doc(db, 'users', userId, 'compositeEvents', compositeEventId)
      const snapshot = await getDoc(reference)
      if (!snapshot.exists()) {
        return null
      }
      const data = snapshot.data()
      const composite = {
        ...data,
        compositeEventId: snapshot.id,
      }
      if (!validateCompositeData(composite, snapshot.id)) {
        logger.error('Invalid composite data', undefined, { compositeId: snapshot.id })
        return null
      }
      return composite as CompositeEvent
    },

    async findByCanonicalEventId(userId, canonicalEventId) {
      const db = await getDb()
      const q = query(
        compositeCollection(db, userId),
        where('canonicalEventIds', 'array-contains', canonicalEventId)
      )
      const snapshot = await getDocs(q)
      return mapSnapshot(snapshot)
    },

    async findByCanonicalEventIds(userId, canonicalEventIds) {
      if (canonicalEventIds.length === 0) {
        return new Map()
      }

      const db = await getDb()
      const resultMap = new Map<string, CompositeEvent[]>()

      // Firestore array-contains queries can only check for one value at a time
      // We need to batch these queries for efficiency
      // Firestore limits: max 30 queries in parallel, max 10 for array-contains-any
      const BATCH_SIZE = 10
      const batches: string[][] = []

      for (let i = 0; i < canonicalEventIds.length; i += BATCH_SIZE) {
        batches.push(canonicalEventIds.slice(i, i + BATCH_SIZE))
      }

      // Process batches in parallel
      await Promise.all(
        batches.map(async (batch) => {
          const q = query(
            compositeCollection(db, userId),
            where('canonicalEventIds', 'array-contains-any', batch)
          )
          const snapshot = await getDocs(q)
          const composites = mapSnapshot(snapshot)

          // Map each composite to the event IDs it contains
          for (const composite of composites) {
            for (const eventId of batch) {
              if (composite.canonicalEventIds?.includes(eventId)) {
                if (!resultMap.has(eventId)) {
                  resultMap.set(eventId, [])
                }
                resultMap.get(eventId)!.push(composite)
              }
            }
          }
        })
      )

      return resultMap
    },

    async findByICalUID(userId, iCalUID) {
      const db = await getDb()
      // Query composites where any member has matching iCalUID
      // Since iCalUID is nested in members array, we need to query all and filter
      // In production, you might denormalize iCalUIDs to a top-level array field
      const q = query(compositeCollection(db, userId))
      const snapshot = await getDocs(q)
      const composites = mapSnapshot(snapshot)
      return composites.filter((c) => c.members.some((m) => m.iCalUID === iCalUID))
    },

    async listByRange(userId, startMs, endMs) {
      const db = await getDb()
      const q = query(
        compositeCollection(db, userId),
        where('startMs', '>=', startMs),
        where('startMs', '<=', endMs)
      )
      const snapshot = await getDocs(q)
      return mapSnapshot(snapshot)
    },

    async create(userId, composite) {
      const db = await getDb()
      const compositeId = composite.id ?? composite.compositeEventId ?? ''
      await setDoc(doc(db, 'users', userId, 'compositeEvents', compositeId), composite)
    },

    async update(userId, compositeEventId, composite) {
      const db = await getDb()
      await setDoc(doc(db, 'users', userId, 'compositeEvents', compositeEventId), composite)
    },

    async delete(userId, compositeEventId) {
      const db = await getDb()
      await deleteDoc(doc(db, 'users', userId, 'compositeEvents', compositeEventId))
    },

    async batchCreate(userId, composites) {
      const db = await getDb()
      const batch = writeBatch(db)
      for (const composite of composites) {
        const compositeId = composite.id ?? composite.compositeEventId ?? ''
        const ref = doc(db, 'users', userId, 'compositeEvents', compositeId)
        batch.set(ref, composite)
      }
      await batch.commit()
    },
  }
}
