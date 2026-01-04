/**
 * Firestore Intervention Repository
 *
 * Implements InterventionRepository interface for Firestore persistence.
 * Handles CRUD operations for Mind Engine intervention presets.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  CanonicalInterventionPreset,
  InterventionId,
  CreateInterventionInput,
  UpdateInterventionInput,
  InterventionRepository,
  InterventionType,
  FeelingState,
} from '@lifeos/mind'

const COLLECTION_INTERVENTIONS = 'interventions'

export const createFirestoreInterventionRepository = (): InterventionRepository => {
  const create = async (
    userId: string,
    input: CreateInterventionInput
  ): Promise<CanonicalInterventionPreset> => {
    const db = await getDb()
    const interventionId = newId<'intervention'>('intervention')
    const now = Date.now()

    const intervention: CanonicalInterventionPreset = {
      ...input,
      interventionId,
      userId,
      createdAtMs: now,
      updatedAtMs: now,
      syncState: 'synced',
      version: 1,
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_INTERVENTIONS}/${interventionId}`)
    await setDoc(ref, intervention)

    return intervention
  }

  const update = async (
    userId: string,
    interventionId: InterventionId,
    updates: UpdateInterventionInput
  ): Promise<CanonicalInterventionPreset> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_INTERVENTIONS}/${interventionId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      throw new Error(`Intervention ${interventionId} not found`)
    }

    const existingIntervention = snapshot.data() as CanonicalInterventionPreset
    const updatedIntervention: CanonicalInterventionPreset = {
      ...existingIntervention,
      ...updates,
      updatedAtMs: Date.now(),
      version: existingIntervention.version + 1,
    }

    await setDoc(ref, updatedIntervention)
    return updatedIntervention
  }

  const deleteIntervention = async (
    userId: string,
    interventionId: InterventionId
  ): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_INTERVENTIONS}/${interventionId}`)
    await deleteDoc(ref)
  }

  const get = async (
    interventionId: InterventionId
  ): Promise<CanonicalInterventionPreset | null> => {
    const db = await getDb()
    // Try to get from system collection first (for system presets)
    if (interventionId.startsWith('intervention:system-')) {
      const systemRef = doc(db, `${COLLECTION_INTERVENTIONS}/${interventionId}`)
      const systemSnapshot = await getDoc(systemRef)

      if (systemSnapshot.exists()) {
        return systemSnapshot.data() as CanonicalInterventionPreset
      }
    }

    // If not found in system, we'd need userId to query user-specific interventions
    // For now, return null if system preset not found
    // In practice, the UI will use listUserPresets or listSystemPresets
    return null
  }

  const listUserPresets = async (userId: string): Promise<CanonicalInterventionPreset[]> => {
    const db = await getDb()
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_INTERVENTIONS}`),
      orderBy('createdAtMs', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalInterventionPreset)
  }

  const listSystemPresets = async (): Promise<CanonicalInterventionPreset[]> => {
    const db = await getDb()
    // System presets are stored at the root level with userId: 'system'
    const q = query(
      collection(db, COLLECTION_INTERVENTIONS),
      where('userId', '==', 'system'),
      orderBy('createdAtMs', 'asc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalInterventionPreset)
  }

  const listByType = async (type: InterventionType): Promise<CanonicalInterventionPreset[]> => {
    const db = await getDb()
    // Query system presets by type
    const q = query(
      collection(db, COLLECTION_INTERVENTIONS),
      where('type', '==', type),
      orderBy('createdAtMs', 'asc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalInterventionPreset)
  }

  const listByFeeling = async (feeling: FeelingState): Promise<CanonicalInterventionPreset[]> => {
    const db = await getDb()
    // Query system presets that include this feeling in their recommendations
    const q = query(
      collection(db, COLLECTION_INTERVENTIONS),
      where('recommendedForFeelings', 'array-contains', feeling),
      orderBy('createdAtMs', 'asc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalInterventionPreset)
  }

  return {
    create,
    update,
    delete: deleteIntervention,
    get,
    listUserPresets,
    listSystemPresets,
    listByType,
    listByFeeling,
  }
}
