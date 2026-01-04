/**
 * Firestore Section Repository
 *
 * Implements SectionRepository interface for Firestore persistence.
 * Handles CRUD operations for sections (subfolders).
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
  writeBatch,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  Section,
  SectionId,
  SectionFilters,
  CreateSectionInput,
  UpdateSectionInput,
  SectionRepository,
} from '@lifeos/notes'

const COLLECTION_SECTIONS = 'sections'

export const createFirestoreSectionRepository = (): SectionRepository => {
  const create = async (userId: string, input: CreateSectionInput): Promise<Section> => {
    const db = await getDb()
    const sectionId = newId<'section'>('section')
    const now = Date.now()

    const section: Section = {
      ...input,
      sectionId,
      createdAtMs: now,
      updatedAtMs: now,
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_SECTIONS}/${sectionId}`)
    await setDoc(ref, section)

    return section
  }

  const update = async (
    userId: string,
    sectionId: SectionId,
    updates: UpdateSectionInput
  ): Promise<Section> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_SECTIONS}/${sectionId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      throw new Error(`Section ${sectionId} not found`)
    }

    const existingSection = snapshot.data() as Section
    const updatedSection: Section = {
      ...existingSection,
      ...updates,
      updatedAtMs: Date.now(),
    }

    await setDoc(ref, updatedSection)
    return updatedSection
  }

  const deleteSection = async (userId: string, sectionId: SectionId): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_SECTIONS}/${sectionId}`)
    await deleteDoc(ref)
  }

  const get = async (userId: string, sectionId: SectionId): Promise<Section | null> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_SECTIONS}/${sectionId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return null
    }

    return snapshot.data() as Section
  }

  const list = async (userId: string, filters?: SectionFilters): Promise<Section[]> => {
    const db = await getDb()
    let q = query(collection(db, `users/${userId}/${COLLECTION_SECTIONS}`))

    if (filters?.topicId) {
      q = query(q, where('topicId', '==', filters.topicId))
    }

    const snapshot = await getDocs(q)
    const sections = snapshot.docs.map((doc) => doc.data() as Section)

    // Sort by order
    return sections.sort((a, b) => a.order - b.order)
  }

  const reorder = async (
    userId: string,
    sectionOrders: { sectionId: SectionId; order: number }[]
  ): Promise<void> => {
    const db = await getDb()
    const batch = writeBatch(db)

    for (const { sectionId, order } of sectionOrders) {
      const ref = doc(db, `users/${userId}/${COLLECTION_SECTIONS}/${sectionId}`)
      batch.update(ref, {
        order,
        updatedAtMs: Date.now(),
      })
    }

    await batch.commit()
  }

  return {
    create,
    update,
    delete: deleteSection,
    get,
    list,
    reorder,
  }
}
