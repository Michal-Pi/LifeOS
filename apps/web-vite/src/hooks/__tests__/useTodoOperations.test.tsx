import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import type { CanonicalProject, CanonicalTask } from '@/types/todo'
import { clearAllLocalData } from '@/todos/offlineStore'

const repo = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getChapters: vi.fn(),
  getTasks: vi.fn(),
  saveProject: vi.fn(),
  deleteProject: vi.fn(),
  saveChapter: vi.fn(),
  deleteChapter: vi.fn(),
  saveTask: vi.fn(),
  deleteTask: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/adapters/firestoreTodoRepository', () => ({
  createFirestoreTodoRepository: () => repo,
}))

const baseProject = (overrides: Partial<CanonicalProject> = {}): CanonicalProject => ({
  id: 'p1',
  userId: 'u1',
  title: 'Project',
  domain: 'work',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  archived: false,
  ...overrides,
})

const baseTask = (overrides: Partial<CanonicalTask> = {}): CanonicalTask => ({
  id: 't1',
  userId: 'u1',
  title: 'Task',
  domain: 'life',
  importance: 4,
  status: 'inbox',
  completed: false,
  archived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('useTodoOperations', () => {
  beforeEach(() => {
    repo.getProjects.mockReset()
    repo.getChapters.mockReset()
    repo.getTasks.mockReset()
    repo.saveProject.mockReset()
    repo.deleteProject.mockReset()
    repo.saveChapter.mockReset()
    repo.deleteChapter.mockReset()
    repo.saveTask.mockReset()
    repo.deleteTask.mockReset()
    return clearAllLocalData()
  })

  it('normalizes loaded tasks against project domain', async () => {
    const project = baseProject()
    const task = baseTask({ projectId: project.id })

    repo.getProjects.mockResolvedValue([project])
    repo.getChapters.mockResolvedValue([])
    repo.getTasks.mockResolvedValue([task])

    const { result } = renderHook(() => useTodoOperations({ userId: 'u1' }))

    await act(async () => {
      await result.current.loadData()
    })

    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0]?.domain).toBe('work')
  })

  it('normalizes new tasks before saving', async () => {
    const project = baseProject()

    repo.getProjects.mockResolvedValue([project])
    repo.getChapters.mockResolvedValue([])
    repo.getTasks.mockResolvedValue([])
    repo.saveTask.mockResolvedValue(undefined)

    const { result } = renderHook(() => useTodoOperations({ userId: 'u1' }))

    await act(async () => {
      await result.current.loadData()
    })

    await act(async () => {
      await result.current.createTask({
        title: 'New Task',
        domain: 'life',
        importance: 4,
        status: 'inbox',
        completed: false,
        archived: false,
        projectId: project.id,
      })
    })

    expect(repo.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        domain: 'work',
      })
    )

    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0]?.domain).toBe('work')
  })
})
