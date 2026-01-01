/**
 * Firestore Workout Plan Repository
 *
 * Adapter for workout plan persistence in Firestore.
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
  WorkoutPlan,
  WorkoutPlanRepository,
  CreatePlanInput,
  UpdatePlanInput,
  PlanId,
} from '@lifeos/training'

const COLLECTION = 'workoutPlans'

function plansCollection(db: Awaited<ReturnType<typeof getDb>>, userId: string) {
  return collection(db, 'users', userId, COLLECTION)
}

function planDoc(db: Awaited<ReturnType<typeof getDb>>, userId: string, planId: PlanId) {
  return doc(db, 'users', userId, COLLECTION, planId)
}

export function createFirestoreWorkoutPlanRepository(): WorkoutPlanRepository {
  return {
    async create(userId: string, input: CreatePlanInput): Promise<WorkoutPlan> {
      const db = await getDb()
      const now = Date.now()
      const planId = generateId('plan') as PlanId

      const plan: WorkoutPlan = {
        planId,
        userId: input.userId,
        active: input.active,
        timezone: input.timezone,
        startDateKey: input.startDateKey,
        schedule: input.schedule,
        createdAtMs: now,
        updatedAtMs: now,
        syncState: 'synced',
        version: 1,
      }

      const docRef = planDoc(db, userId, planId)
      await updateDoc(docRef, {
        ...plan,
        createdAt: Timestamp.fromMillis(now),
        updatedAt: Timestamp.fromMillis(now),
      }).catch(async () => {
        // Document doesn't exist, create it
        await addDoc(plansCollection(db, userId), {
          ...plan,
          createdAt: Timestamp.fromMillis(now),
          updatedAt: Timestamp.fromMillis(now),
        })
      })

      return plan
    },

    async update(userId: string, planId: PlanId, updates: UpdatePlanInput): Promise<WorkoutPlan> {
      const db = await getDb()
      const docRef = planDoc(db, userId, planId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        throw new Error(`Plan ${planId} not found`)
      }

      const existing = docSnap.data() as WorkoutPlan

      if (existing.userId !== userId) {
        throw new Error('Unauthorized')
      }

      const now = Date.now()
      const updated: WorkoutPlan = {
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

    async delete(userId: string, planId: PlanId): Promise<void> {
      const db = await getDb()
      const docRef = planDoc(db, userId, planId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        throw new Error(`Plan ${planId} not found`)
      }

      const plan = docSnap.data() as WorkoutPlan

      if (plan.userId !== userId) {
        throw new Error('Unauthorized')
      }

      await deleteDoc(docRef)
    },

    async get(userId: string, planId: PlanId): Promise<WorkoutPlan | null> {
      const db = await getDb()
      const docRef = planDoc(db, userId, planId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        return null
      }

      const plan = docSnap.data() as WorkoutPlan

      if (plan.userId !== userId) {
        throw new Error('Unauthorized')
      }

      return plan
    },

    async getActive(userId: string): Promise<WorkoutPlan | null> {
      const db = await getDb()
      const q = query(
        plansCollection(db, userId),
        where('userId', '==', userId),
        where('active', '==', true),
        orderBy('startDateKey', 'desc')
      )

      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        return null
      }

      return snapshot.docs[0].data() as WorkoutPlan
    },

    async list(userId: string): Promise<WorkoutPlan[]> {
      const db = await getDb()
      const q = query(
        plansCollection(db, userId),
        where('userId', '==', userId),
        orderBy('startDateKey', 'desc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as WorkoutPlan)
    },
  }
}
