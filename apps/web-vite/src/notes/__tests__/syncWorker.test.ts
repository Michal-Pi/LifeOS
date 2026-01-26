/**
 * Tests for note sync worker offline cleanup.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Topic, TopicId, Section, SectionId } from '@lifeos/notes'
import {
  saveTopicLocally,
  saveSectionLocally,
  listTopicsLocally,
  listSectionsByTopicLocally,
  clearAllLocalData,
} from '../offlineStore'
import { syncNotes } from '../syncWorker'

const noteRepository = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

const topicRepository = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

const sectionRepository = vi.hoisted(() => ({
  listByTopic: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/adapters/notes/firestoreNoteRepository', () => ({
  createFirestoreNoteRepository: () => noteRepository,
}))

vi.mock('@/adapters/notes/firestoreTopicRepository', () => ({
  createFirestoreTopicRepository: () => topicRepository,
}))

vi.mock('@/adapters/notes/firestoreSectionRepository', () => ({
  createFirestoreSectionRepository: () => sectionRepository,
}))

describe('Note Sync Worker', () => {
  const userId = 'user-1'

  beforeEach(async () => {
    vi.clearAllMocks()
    await clearAllLocalData()
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  it('removes local topics and sections deleted remotely', async () => {
    const topicId = 'topic-1' as TopicId
    const sectionId = 'section-1' as SectionId

    const localTopic: Topic & { syncState: 'synced' } = {
      topicId,
      userId,
      name: 'Local Topic',
      parentTopicId: null,
      order: 0,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
    }

    const localSection: Section & { syncState: 'synced' } = {
      sectionId,
      userId,
      topicId,
      name: 'Local Section',
      order: 0,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
    }

    await saveTopicLocally(localTopic)
    await saveSectionLocally(localSection)

    topicRepository.list.mockResolvedValue([])
    sectionRepository.listByTopic.mockResolvedValue([])
    noteRepository.list.mockResolvedValue([])

    await syncNotes(userId)

    const topics = await listTopicsLocally(userId)
    const sections = await listSectionsByTopicLocally(userId, topicId)

    expect(topics).toHaveLength(0)
    expect(sections).toHaveLength(0)
  })
})
