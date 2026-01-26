import {
  addDoc,
  collection,
  collectionGroup,
  type DocumentReference,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type { WorkspaceId, RunId } from '@lifeos/agents'
import type {
  Assumption,
  Conflict,
  ConversationContext,
  ConversationContextId,
  ConversationTurn,
  DecisionRecord,
  Requirement,
  UserProfile,
} from '@lifeos/agents'
import type { ProjectManagerRepository } from '@lifeos/agents'

const PROFILE_DOC_ID = 'profile'

const loadSubcollection = async <T>(
  contextRef: DocumentReference,
  name: string
): Promise<T[]> => {
  const colRef = collection(contextRef, name)
  const snapshot = await getDocs(query(colRef, orderBy('createdAtMs', 'asc')))
  return snapshot.docs.map((docSnap) => docSnap.data() as T)
}

export const createFirestoreProjectManagerRepository = (): ProjectManagerRepository => {
  return {
    async createContext(
      userId: string,
      workspaceId?: WorkspaceId,
      runId?: RunId
    ): Promise<ConversationContext> {
      const db = await getDb()
      const contextId = newId('pmContext')
      const now = Date.now()
      const context: ConversationContext = {
        contextId,
        userId,
        workspaceId,
        runId,
        requirements: [],
        assumptions: [],
        decisions: [],
        conflicts: [],
        turnCount: 0,
        startedAtMs: now,
        lastUpdatedAtMs: now,
        summary: undefined,
        fullHistory: [],
      }
      const contextRef = doc(db, `users/${userId}/pmContexts/${contextId}`)
      await setDoc(contextRef, context)
      return context
    },

    async getContext(
      userId: string,
      contextId: ConversationContextId
    ): Promise<ConversationContext | null> {
      const db = await getDb()
      const docSnap = await getDoc(doc(db, `users/${userId}/pmContexts/${contextId}`))
      if (!docSnap.exists()) return null
      const base = docSnap.data() as ConversationContext

      const [requirements, assumptions, decisions, conflicts, fullHistory] = await Promise.all([
        loadSubcollection<Requirement>(docSnap.ref, 'requirements'),
        loadSubcollection<Assumption>(docSnap.ref, 'assumptions'),
        loadSubcollection<DecisionRecord>(docSnap.ref, 'decisions'),
        loadSubcollection<Conflict>(docSnap.ref, 'conflicts'),
        loadSubcollection<ConversationTurn>(docSnap.ref, 'turns'),
      ])

      return {
        ...base,
        requirements,
        assumptions,
        decisions,
        conflicts,
        fullHistory,
      }
    },

    async getActiveContext(
      userId: string,
      workspaceId?: WorkspaceId
    ): Promise<ConversationContext | null> {
      const db = await getDb()
      let q = query(
        collection(db, `users/${userId}/pmContexts`),
        orderBy('lastUpdatedAtMs', 'desc'),
        firestoreLimit(1)
      )
      if (workspaceId) {
        q = query(
          collection(db, `users/${userId}/pmContexts`),
          where('workspaceId', '==', workspaceId),
          orderBy('lastUpdatedAtMs', 'desc'),
          firestoreLimit(1)
        )
      }
      const snapshot = await getDocs(q)
      const docSnap = snapshot.docs[0]
      if (!docSnap) return null
      const base = docSnap.data() as ConversationContext
      const [requirements, assumptions, decisions, conflicts, fullHistory] = await Promise.all([
        loadSubcollection<Requirement>(docSnap.ref, 'requirements'),
        loadSubcollection<Assumption>(docSnap.ref, 'assumptions'),
        loadSubcollection<DecisionRecord>(docSnap.ref, 'decisions'),
        loadSubcollection<Conflict>(docSnap.ref, 'conflicts'),
        loadSubcollection<ConversationTurn>(docSnap.ref, 'turns'),
      ])

      return {
        ...base,
        requirements,
        assumptions,
        decisions,
        conflicts,
        fullHistory,
      }
    },

    async updateContext(
      userId: string,
      contextId: ConversationContextId,
      updates: Partial<ConversationContext>
    ): Promise<ConversationContext> {
      const db = await getDb()
      const docSnap = await getDoc(doc(db, `users/${userId}/pmContexts/${contextId}`))
      if (!docSnap.exists()) {
        throw new Error('Context not found after update')
      }
      await updateDoc(docSnap.ref, { ...updates, lastUpdatedAtMs: Date.now() })
      const updated = await getDoc(docSnap.ref)
      if (!updated.exists()) {
        throw new Error('Context not found after update')
      }
      return updated.data() as ConversationContext
    },

    async addTurn(
      userId: string,
      contextId: ConversationContextId,
      turn: ConversationTurn
    ): Promise<void> {
      const db = await getDb()
      const docSnap = await getDoc(doc(db, `users/${userId}/pmContexts/${contextId}`))
      if (!docSnap.exists()) {
        throw new Error('Context not found for turn')
      }
      const turnsRef = collection(docSnap.ref, 'turns')
      await addDoc(turnsRef, { ...turn, userId, createdAtMs: Date.now() })
      await updateDoc(docSnap.ref, {
        turnCount: (docSnap.data().turnCount ?? 0) + 1,
        lastUpdatedAtMs: Date.now(),
      })
    },

    async addRequirement(
      userId: string,
      contextId: ConversationContextId,
      requirement: Requirement
    ): Promise<void> {
      const db = await getDb()
      const docSnap = await getDoc(doc(db, `users/${userId}/pmContexts/${contextId}`))
      if (!docSnap.exists()) {
        throw new Error('Context not found for requirement')
      }
      const ref = collection(docSnap.ref, 'requirements')
      await addDoc(ref, { ...requirement, userId, createdAtMs: Date.now() })
      await updateDoc(docSnap.ref, { lastUpdatedAtMs: Date.now() })
    },

    async addAssumption(
      userId: string,
      contextId: ConversationContextId,
      assumption: Assumption
    ): Promise<void> {
      const db = await getDb()
      const docSnap = await getDoc(doc(db, `users/${userId}/pmContexts/${contextId}`))
      if (!docSnap.exists()) {
        throw new Error('Context not found for assumption')
      }
      const ref = collection(docSnap.ref, 'assumptions')
      await addDoc(ref, { ...assumption, userId, createdAtMs: Date.now() })
      await updateDoc(docSnap.ref, { lastUpdatedAtMs: Date.now() })
    },

    async addDecision(
      userId: string,
      contextId: ConversationContextId,
      decision: DecisionRecord
    ): Promise<void> {
      const db = await getDb()
      const docSnap = await getDoc(doc(db, `users/${userId}/pmContexts/${contextId}`))
      if (!docSnap.exists()) {
        throw new Error('Context not found for decision')
      }
      const ref = collection(docSnap.ref, 'decisions')
      await addDoc(ref, { ...decision, userId, createdAtMs: Date.now() })
      await updateDoc(docSnap.ref, { lastUpdatedAtMs: Date.now() })
    },

    async addConflict(
      userId: string,
      contextId: ConversationContextId,
      conflict: Conflict
    ): Promise<void> {
      const db = await getDb()
      const docSnap = await getDoc(doc(db, `users/${userId}/pmContexts/${contextId}`))
      if (!docSnap.exists()) {
        throw new Error('Context not found for conflict')
      }
      const ref = collection(docSnap.ref, 'conflicts')
      await addDoc(ref, { ...conflict, userId, createdAtMs: Date.now() })
      await updateDoc(docSnap.ref, { lastUpdatedAtMs: Date.now() })
    },

    async getProfile(userId: string): Promise<UserProfile | null> {
      const db = await getDb()
      const profileRef = doc(db, `users/${userId}/pmProfile/${PROFILE_DOC_ID}`)
      const snapshot = await getDoc(profileRef)
      if (!snapshot.exists()) return null
      return snapshot.data() as UserProfile
    },

    async createProfile(userId: string): Promise<UserProfile> {
      const db = await getDb()
      const now = Date.now()
      const profile: UserProfile = {
        profileId: newId('pmProfile'),
        userId,
        expertiseLevel: 'beginner',
        preferredDetailLevel: 'high-level',
        totalInteractions: 0,
        averageQuestionsPerSession: 0,
        expertCouncilUsageRate: 0,
        satisfactionScore: 0,
        createdAtMs: now,
        updatedAtMs: now,
      }
      const profileRef = doc(db, `users/${userId}/pmProfile/${PROFILE_DOC_ID}`)
      await setDoc(profileRef, profile)
      return profile
    },

    async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
      const db = await getDb()
      const profileRef = doc(db, `users/${userId}/pmProfile/${PROFILE_DOC_ID}`)
      await updateDoc(profileRef, { ...updates, updatedAtMs: Date.now() })
      const updated = await getDoc(profileRef)
      if (!updated.exists()) {
        throw new Error('Profile not found after update')
      }
      return updated.data() as UserProfile
    },

    async getDecisionHistory(userId: string, limitCount: number = 20): Promise<DecisionRecord[]> {
      const db = await getDb()
      const q = query(
        collectionGroup(db, 'decisions'),
        where('userId', '==', userId),
        orderBy('decidedAtMs', 'desc'),
        firestoreLimit(limitCount)
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((docSnap) => docSnap.data() as DecisionRecord)
    },

    async getConflictHistory(userId: string, limitCount: number = 20): Promise<Conflict[]> {
      const db = await getDb()
      const q = query(
        collectionGroup(db, 'conflicts'),
        where('userId', '==', userId),
        orderBy('detectedAtTurn', 'desc'),
        firestoreLimit(limitCount)
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((docSnap) => docSnap.data() as Conflict)
    },
  }
}
