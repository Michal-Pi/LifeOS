import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseStructuredPlan, createTodosFromPlan } from '../planToTodos.js'
import type { StructuredPlan } from '@lifeos/agents'

const VALID_PLAN: StructuredPlan = {
  projectName: 'Launch MVP',
  milestones: [
    {
      name: 'Design',
      tasks: [
        {
          title: 'Create wireframes',
          description: 'Design the main screens',
          dependencies: [],
          estimatedHours: 4,
          assignee: 'user',
          milestone: 'Design',
        },
        {
          title: 'Design system setup',
          description: 'Set up colors and components',
          dependencies: ['Create wireframes'],
          estimatedHours: 2,
          assignee: 'user',
          milestone: 'Design',
        },
      ],
    },
    {
      name: 'Development',
      tasks: [
        {
          title: 'Build frontend',
          description: 'Implement the UI',
          dependencies: ['Design system setup'],
          estimatedHours: 8,
          assignee: 'user',
          milestone: 'Development',
        },
      ],
    },
  ],
  summary: 'Launch the MVP in two phases.',
}

describe('Phase 42 — parseStructuredPlan', () => {
  it('parses valid JSON plan', () => {
    const raw = JSON.stringify(VALID_PLAN)
    const result = parseStructuredPlan(raw)
    expect(result.projectName).toBe('Launch MVP')
    expect(result.milestones).toHaveLength(2)
    expect(result.milestones[0].tasks).toHaveLength(2)
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n' + JSON.stringify(VALID_PLAN) + '\n```'
    const result = parseStructuredPlan(raw)
    expect(result.projectName).toBe('Launch MVP')
  })

  it('throws on missing projectName', () => {
    const raw = JSON.stringify({ milestones: [], summary: 'x' })
    expect(() => parseStructuredPlan(raw)).toThrow('projectName')
  })

  it('throws on missing milestones', () => {
    const raw = JSON.stringify({ projectName: 'Test', summary: 'x' })
    expect(() => parseStructuredPlan(raw)).toThrow('milestones')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseStructuredPlan('not json at all')).toThrow()
  })
})

describe('Phase 42 — createTodosFromPlan', () => {
  const mockAdd = vi.fn()
  const mockCollection = vi.fn().mockReturnValue({ add: mockAdd })
  const mockFirestore = { collection: mockCollection } as unknown as FirebaseFirestore.Firestore

  beforeEach(() => {
    vi.clearAllMocks()
    mockAdd.mockResolvedValue({ id: 'todo-123' })
  })

  it('creates correct number of todos', async () => {
    const result = await createTodosFromPlan(VALID_PLAN, 'user-1', mockFirestore)
    expect(result.created).toBe(3)
    expect(result.errors).toHaveLength(0)
    expect(mockAdd).toHaveBeenCalledTimes(3)
  })

  it('sets correct fields on each todo', async () => {
    await createTodosFromPlan(VALID_PLAN, 'user-1', mockFirestore)

    const firstCall = mockAdd.mock.calls[0][0]
    expect(firstCall.title).toBe('Create wireframes')
    expect(firstCall.description).toBe('Design the main screens')
    expect(firstCall.status).toBe('inbox')
    expect(firstCall.estimatedMinutes).toBe(240) // 4 hours * 60
    expect(firstCall.milestone).toBe('Design')
    expect(firstCall.source).toBe('plan')
  })

  it('handles empty milestones gracefully', async () => {
    const emptyPlan: StructuredPlan = {
      projectName: 'Empty',
      milestones: [{ name: 'Phase 1', tasks: [] }],
      summary: 'Nothing to do',
    }
    const result = await createTodosFromPlan(emptyPlan, 'user-1', mockFirestore)
    expect(result.created).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('continues on partial failure', async () => {
    mockAdd
      .mockResolvedValueOnce({ id: 'ok-1' })
      .mockRejectedValueOnce(new Error('Firestore write failed'))
      .mockResolvedValueOnce({ id: 'ok-3' })

    const result = await createTodosFromPlan(VALID_PLAN, 'user-1', mockFirestore)
    expect(result.created).toBe(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Design system setup')
    expect(result.errors[0]).toContain('Firestore write failed')
  })

  it('uses correct Firestore collection path', async () => {
    await createTodosFromPlan(VALID_PLAN, 'user-42', mockFirestore)
    expect(mockCollection).toHaveBeenCalledWith('users/user-42/todos')
  })
})
