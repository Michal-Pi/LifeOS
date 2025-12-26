/**
 * Tests for Note Outbox
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { openDB, type IDBPDatabase } from 'idb'
import type { Note, NoteId } from '@lifeos/notes'
import {
  enqueueNoteOp,
  listReadyNoteOps,
  markNoteOpFailed,
  type NoteCreatePayload,
  type NoteUpdatePayload,
} from '../noteOutbox'

vi.mock('idb', () => ({
  openDB: vi.fn(),
}))

describe('Note Outbox', () => {
  const mockUserId = 'test-user-123'
  const mockNoteId = 'note-123' as NoteId

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-op-id')
    vi.spyOn(localStorage, 'getItem').mockReturnValue('test-device-id')
  })

  describe('enqueueNoteOp', () => {
    it('should create a new note operation', async () => {
      const mockNote: Note = {
        noteId: mockNoteId,
        userId: mockUserId,
        title: 'Test Note',
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
      }

      const payload: NoteCreatePayload = { note: mockNote }

      const mockStore = {
        add: vi.fn(),
        index: vi.fn(() => ({
          getAll: vi.fn().mockResolvedValue([]),
        })),
      }

      const mockTx = {
        objectStore: vi.fn(() => mockStore),
        done: Promise.resolve(),
      }

      const mockDb = {
        transaction: vi.fn(() => mockTx),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      const op = await enqueueNoteOp('create', mockUserId, mockNoteId, payload)

      expect(op.type).toBe('create')
      expect(op.userId).toBe(mockUserId)
      expect(op.noteId).toBe(mockNoteId)
      expect(op.status).toBe('pending')
      expect(mockStore.add).toHaveBeenCalled()
    })

    it('should coalesce multiple updates to the same note', async () => {
      const existingOp = {
        opId: 'existing-op-id',
        type: 'update',
        userId: mockUserId,
        noteId: mockNoteId,
        payload: { noteId: mockNoteId, updates: { title: 'Old Title' } },
        status: 'pending',
        deviceId: 'test-device',
        createdAtMs: Date.now(),
        availableAtMs: Date.now(),
        attempts: 0,
        maxAttempts: 10,
      }

      const mockStore = {
        put: vi.fn(),
        index: vi.fn(() => ({
          getAll: vi.fn().mockResolvedValue([existingOp]),
        })),
      }

      const mockTx = {
        objectStore: vi.fn(() => mockStore),
        done: Promise.resolve(),
      }

      const mockDb = {
        transaction: vi.fn(() => mockTx),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      const newPayload: NoteUpdatePayload = {
        noteId: mockNoteId,
        updates: { title: 'New Title' },
      }

      const op = await enqueueNoteOp('update', mockUserId, mockNoteId, newPayload)

      expect(mockStore.put).toHaveBeenCalled()
      expect(op.opId).toBe('existing-op-id') // Reused existing op
    })

    it('should delete override pending creates and updates', async () => {
      const existingOps = [
        {
          opId: 'create-op',
          type: 'create',
          userId: mockUserId,
          noteId: mockNoteId,
          status: 'pending',
        },
        {
          opId: 'update-op',
          type: 'update',
          userId: mockUserId,
          noteId: mockNoteId,
          status: 'pending',
        },
      ]

      const mockStore = {
        delete: vi.fn(),
        add: vi.fn(),
        index: vi.fn(() => ({
          getAll: vi.fn().mockResolvedValue(existingOps),
        })),
      }

      const mockTx = {
        objectStore: vi.fn(() => mockStore),
        done: Promise.resolve(),
      }

      const mockDb = {
        transaction: vi.fn(() => mockTx),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      await enqueueNoteOp('delete', mockUserId, mockNoteId, { noteId: mockNoteId })

      // Should delete both existing ops
      expect(mockStore.delete).toHaveBeenCalledTimes(2)
      expect(mockStore.delete).toHaveBeenCalledWith('create-op')
      expect(mockStore.delete).toHaveBeenCalledWith('update-op')
    })
  })

  describe('listReadyNoteOps', () => {
    it('should return only ready operations', async () => {
      const now = Date.now()

      const ops = [
        {
          opId: 'op-1',
          userId: mockUserId,
          status: 'pending',
          availableAtMs: now - 1000, // Ready
          attempts: 0,
          maxAttempts: 10,
        },
        {
          opId: 'op-2',
          userId: mockUserId,
          status: 'pending',
          availableAtMs: now + 10000, // Not ready yet (future)
          attempts: 0,
          maxAttempts: 10,
        },
        {
          opId: 'op-3',
          userId: mockUserId,
          status: 'pending',
          availableAtMs: now - 1000,
          attempts: 10, // Max attempts reached
          maxAttempts: 10,
        },
        {
          opId: 'op-4',
          userId: mockUserId,
          status: 'applied', // Already applied
          availableAtMs: now - 1000,
          attempts: 0,
          maxAttempts: 10,
        },
      ]

      const mockDb = {
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => ({
            index: vi.fn(() => ({
              getAll: vi.fn().mockResolvedValue(ops),
            })),
          })),
        })),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      const ready = await listReadyNoteOps(mockUserId)

      expect(ready).toHaveLength(1)
      expect(ready[0].opId).toBe('op-1')
    })
  })

  describe('markNoteOpFailed', () => {
    it('should mark operation as failed and calculate backoff', async () => {
      const mockOp = {
        opId: 'test-op',
        status: 'applying',
        attempts: 2,
        availableAtMs: Date.now(),
      }

      const mockDb = {
        get: vi.fn().mockResolvedValue(mockOp),
        put: vi.fn(),
      }

      vi.mocked(openDB).mockResolvedValue(mockDb as unknown as IDBPDatabase)

      await markNoteOpFailed('test-op', new Error('Network error'), 'NETWORK_ERROR')

      expect(mockDb.put).toHaveBeenCalled()
      const updatedOp = mockDb.put.mock.calls[0][1]

      expect(updatedOp.status).toBe('failed')
      expect(updatedOp.attempts).toBe(3)
      expect(updatedOp.lastError).toEqual({
        message: 'Network error',
        code: 'NETWORK_ERROR',
        timestamp: expect.any(Number),
      })

      // Check that backoff was applied (should be in the future)
      expect(updatedOp.availableAtMs).toBeGreaterThan(Date.now() - 1000)
    })
  })
})
