/**
 * Firestore Topic Repository
 *
 * Implements TopicRepository interface for Firestore persistence.
 * Handles CRUD operations for topics (folders).
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
  Topic,
  TopicId,
  TopicFilters,
  CreateTopicInput,
  UpdateTopicInput,
  TopicRepository,
} from '@lifeos/notes'

const COLLECTION_TOPICS = 'topics'

export const createFirestoreTopicRepository = (): TopicRepository => {
  const create = async (userId: string, input: CreateTopicInput): Promise<Topic> => {
    const db = await getDb()
    const topicId = newId<'topic'>('topic')
    const now = Date.now()

    const topic: Topic = {
      ...input,
      topicId,
      createdAtMs: now,
      updatedAtMs: now,
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_TOPICS}/${topicId}`)
    await setDoc(ref, topic)

    return topic
  }

  const update = async (
    userId: string,
    topicId: TopicId,
    updates: UpdateTopicInput
  ): Promise<Topic> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_TOPICS}/${topicId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      throw new Error(`Topic ${topicId} not found`)
    }

    const existingTopic = snapshot.data() as Topic
    const updatedTopic: Topic = {
      ...existingTopic,
      ...updates,
      updatedAtMs: Date.now(),
    }

    await setDoc(ref, updatedTopic)
    return updatedTopic
  }

  const deleteTopic = async (userId: string, topicId: TopicId): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_TOPICS}/${topicId}`)
    await deleteDoc(ref)
  }

  const get = async (userId: string, topicId: TopicId): Promise<Topic | null> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_TOPICS}/${topicId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return null
    }

    return snapshot.data() as Topic
  }

  const list = async (userId: string, filters?: TopicFilters): Promise<Topic[]> => {
    const db = await getDb()
    let q = query(collection(db, `users/${userId}/${COLLECTION_TOPICS}`))

    if (filters?.parentTopicId !== undefined) {
      q = query(q, where('parentTopicId', '==', filters.parentTopicId))
    }

    const snapshot = await getDocs(q)
    const topics = snapshot.docs.map((doc) => doc.data() as Topic)

    // Sort by order
    return topics.sort((a, b) => a.order - b.order)
  }

  const reorder = async (
    userId: string,
    topicOrders: { topicId: TopicId; order: number }[]
  ): Promise<void> => {
    const db = await getDb()
    const batch = writeBatch(db)

    for (const { topicId, order } of topicOrders) {
      const ref = doc(db, `users/${userId}/${COLLECTION_TOPICS}/${topicId}`)
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
    delete: deleteTopic,
    get,
    list,
    reorder,
  }
}
