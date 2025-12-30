/**
 * Tests for Offline Store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { openDB, type IDBPDatabase } from 'idb'
import type { Note } from '@lifeos/notes'
import {
  saveNoteLocally,
  getNoteLocally,
  listNotesLocally,
  searchNotesLocally,
  getUnsyncedNotes,
  getStorageStats,
  __resetNotesDbForTests,
} from '../offlineStore'

// Mock idb
vi.mock('idb', () => ({
  openDB: vi.fn(),
}))

describe('Offline Store', () => {
  const mockUserId = 'test-user-123'

  beforeEach(() => {
    vi.clearAllMocks()
    __resetNotesDbForTests()
  })

  describe('Note Operations', () => {
    it('should save and retrieve a note', async () => {
      const mockNote: Note = {
        noteId: 'note-1' as Note['noteId'],
        userId: mockUserId,
        title: 'Test Note',
        content: { type: 'doc', content: [] },
        contentHtml: '<p>Test</p>',
        topicId: null,
        sectionId: null,
        projectIds: [],
        okrIds: [],
        tags: ['test'],
        attachmentIds: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        lastAccessedMs: Date.now(),
        syncState: 'synced',
      }

      const mockDb = {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(mockNote),
        transaction: vi.fn(() => ({
          store: {
            index: vi.fn(() => ({
              getAll: vi.fn().mockResolvedValue([mockNote]),
            })),
          },
        })),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      await saveNoteLocally(mockNote)
      expect(mockDb.put).toHaveBeenCalledWith('notes', mockNote)

      const retrieved = await getNoteLocally(mockNote.noteId)
      expect(retrieved).toEqual(mockNote)
    })

    it('should list notes by user', async () => {
      const mockNotes: Note[] = [
        {
          noteId: 'note-1' as Note['noteId'],
          userId: mockUserId,
          title: 'Note 1',
          content: { type: 'doc', content: [] },
          topicId: null,
          sectionId: null,
          projectIds: [],
          okrIds: [],
          tags: [],
          attachmentIds: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          lastAccessedMs: Date.now(),
          syncState: 'synced',
        } as Note,
        {
          noteId: 'note-2' as Note['noteId'],
          userId: mockUserId,
          title: 'Note 2',
          content: { type: 'doc', content: [] },
          topicId: null,
          sectionId: null,
          projectIds: [],
          okrIds: [],
          tags: [],
          attachmentIds: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          lastAccessedMs: Date.now(),
          syncState: 'pending',
        } as Note,
      ]

      const mockDb = {
        transaction: vi.fn(() => ({
          store: {
            index: vi.fn(() => ({
              getAll: vi.fn().mockResolvedValue(mockNotes),
            })),
          },
        })),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      const notes = await listNotesLocally(mockUserId)
      expect(notes).toHaveLength(2)
    })

    it('should find unsynced notes', async () => {
      const mockNotes: Note[] = [
        {
          noteId: 'note-1' as Note['noteId'],
          userId: mockUserId,
          syncState: 'synced',
        } as Note,
        {
          noteId: 'note-2' as Note['noteId'],
          userId: mockUserId,
          syncState: 'pending',
        } as Note,
        {
          noteId: 'note-3' as Note['noteId'],
          userId: mockUserId,
          syncState: 'failed',
        } as Note,
      ]

      const mockDb = {
        transaction: vi.fn(() => ({
          store: {
            index: vi.fn(() => ({
              getAll: vi.fn().mockResolvedValue(mockNotes),
            })),
          },
        })),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      const unsynced = await getUnsyncedNotes(mockUserId)
      expect(unsynced).toHaveLength(2)
      expect(unsynced.every((n) => n.syncState !== 'synced')).toBe(true)
    })
  })

  describe('Search', () => {
    it('should search notes by text query', async () => {
      const mockNotes: Note[] = [
        {
          noteId: 'note-1' as Note['noteId'],
          userId: mockUserId,
          title: 'JavaScript Basics',
          contentHtml: '<p>Learn about variables and functions</p>',
          tags: ['programming'],
          syncState: 'synced',
        } as Note,
        {
          noteId: 'note-2' as Note['noteId'],
          userId: mockUserId,
          title: 'Python Tutorial',
          contentHtml: '<p>Introduction to Python</p>',
          tags: ['programming'],
          syncState: 'synced',
        } as Note,
        {
          noteId: 'note-3' as Note['noteId'],
          userId: mockUserId,
          title: 'Cooking Recipe',
          contentHtml: '<p>How to make pasta</p>',
          tags: ['cooking'],
          syncState: 'synced',
        } as Note,
      ]

      const mockDb = {
        transaction: vi.fn(() => ({
          store: {
            index: vi.fn(() => ({
              getAll: vi.fn().mockResolvedValue(mockNotes),
            })),
          },
        })),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      const results = await searchNotesLocally(mockUserId, 'javascript')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('JavaScript Basics')
    })
  })

  describe('Storage Stats', () => {
    it('should return correct statistics', async () => {
      const mockNotes: Note[] = [
        { noteId: 'note-1', userId: mockUserId, syncState: 'synced' } as Note,
        { noteId: 'note-2', userId: mockUserId, syncState: 'pending' } as Note,
      ]

      const mockDb = {
        transaction: vi.fn(() => ({
          store: {
            index: vi.fn(() => ({
              getAll: vi.fn((userId) => {
                if (userId === mockUserId) {
                  return Promise.resolve(mockNotes)
                }
                return Promise.resolve([])
              }),
            })),
          },
        })),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      const stats = await getStorageStats(mockUserId)
      expect(stats.totalNotes).toBe(2)
      expect(stats.unsyncedNotes).toBe(1)
    })
  })
})
