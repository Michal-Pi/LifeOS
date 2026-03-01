import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@lifeos/calendar'
import { useRepositories } from '@/contexts/RepositoryContext'
import type { CanonicalProject, CanonicalChapter, CanonicalTask } from '@/types/todo'
import { generateId } from '@/lib/idGenerator'
import { mergeTasksForLoad, normalizeTaskForSave } from '@/lib/todoRules'
import {
  listProjectsLocally,
  saveProjectLocally,
  deleteProjectLocally,
  listChaptersLocally,
  saveChapterLocally,
  deleteChapterLocally,
  listTasksLocally,
  saveTaskLocally,
  deleteTaskLocally,
  type LocalProject,
  type LocalChapter,
  type LocalTask,
} from '@/todos/offlineStore'
import {
  enqueueProjectOp,
  enqueueChapterOp,
  enqueueTaskOp,
  type ProjectCreatePayload,
  type ProjectDeletePayload,
  type ChapterCreatePayload,
  type ChapterDeletePayload,
  type TaskCreatePayload,
  type TaskUpdatePayload,
  type TaskDeletePayload,
} from '@/todos/todoOutbox'

const logger = createLogger('useTodoOperations')

interface UseTodoOperationsProps {
  userId: string
}

export function useTodoOperations({ userId }: UseTodoOperationsProps) {
  const { todoRepository } = useRepositories()
  const [projects, setProjects] = useState<CanonicalProject[]>([])
  const [chapters, setChapters] = useState<CanonicalChapter[]>([])
  const [tasks, setTasks] = useState<CanonicalTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastUserIdRef = useRef<string | null>(null)

  const loadData = useCallback(
    async (options?: { includeTasks?: boolean }) => {
      // Guard against empty string or null/undefined
      if (!userId || userId.trim() === '') {
        return
      }
      if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
        setProjects([])
        setChapters([])
        setTasks([])
      }
      setLoading(true)
      try {
        const includeTasks = options?.includeTasks !== false

        // Load from IndexedDB first (instant response)
        const [localProjects, localChapters, localTasks] = await Promise.all([
          listProjectsLocally(userId),
          listChaptersLocally(userId),
          includeTasks ? listTasksLocally(userId) : Promise.resolve([]),
        ])

        // Update state with local data immediately
        setProjects(localProjects)
        setChapters(localChapters)
        if (includeTasks) {
          setTasks((prev) => mergeTasksForLoad(prev, localTasks, localProjects))
        }

        try {
          const [remoteProjects, remoteChapters, remoteTasks] = await Promise.all([
            todoRepository.getProjects(userId),
            todoRepository.getChapters(userId),
            includeTasks ? todoRepository.getTasks(userId) : Promise.resolve([]),
          ])

          for (const project of remoteProjects) {
            await saveProjectLocally({ ...project, syncState: 'synced' })
          }
          for (const chapter of remoteChapters) {
            await saveChapterLocally({ ...chapter, syncState: 'synced' })
          }
          for (const task of remoteTasks) {
            await saveTaskLocally({ ...task, syncState: 'synced' })
          }

          setProjects((prev) => {
            const prevMap = new Map(prev.map((p) => [p.id, p]))
            const updated = remoteProjects.map((p) => {
              const local = prevMap.get(p.id)
              if (!local || p.updatedAt >= local.updatedAt) {
                return { ...p, syncState: 'synced' as const }
              }
              return local
            })
            return updated.length !== prev.length || updated.some((p, i) => p.id !== prev[i]?.id)
              ? updated
              : prev
          })

          setChapters((prev) => {
            const prevMap = new Map(prev.map((c) => [c.id, c]))
            const updated = remoteChapters.map((c) => {
              const local = prevMap.get(c.id)
              if (!local || c.updatedAt >= local.updatedAt) {
                return { ...c, syncState: 'synced' as const }
              }
              return local
            })
            return updated.length !== prev.length || updated.some((c, i) => c.id !== prev[i]?.id)
              ? updated
              : prev
          })

          if (includeTasks) {
            setTasks((prev) => {
              const merged = mergeTasksForLoad(prev, remoteTasks, remoteProjects)
              return merged.length !== prev.length || merged.some((t, i) => t.id !== prev[i]?.id)
                ? merged
                : prev
            })
          }
        } catch (err: unknown) {
          const error = err as Error
          logger.error('Failed to sync from Firestore:', error)
          // Don't show error toast - local data is already loaded
        }

        lastUserIdRef.current = userId
      } catch (err: unknown) {
        const error = err as Error
        logger.error('Failed to load todo data:', error)
        const errorMessage = error.message
        setError(errorMessage)
        toast.error('Failed to load data', {
          description: errorMessage,
        })
      } finally {
        setLoading(false)
      }
    },
    [userId, todoRepository]
  )

  const loadTasks = useCallback(
    async (options?: { projectId?: string; chapterId?: string }) => {
      if (!userId) return
      if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
        setProjects([])
        setChapters([])
        setTasks([])
      }
      setLoading(true)
      try {
        // Load from IndexedDB first
        let localTasks = await listTasksLocally(userId)

        // Filter by options if provided
        if (options?.chapterId) {
          localTasks = localTasks.filter((t) => t.chapterId === options.chapterId)
        } else if (options?.projectId) {
          localTasks = localTasks.filter((t) => t.projectId === options.projectId)
        }

        // Update state with local data immediately
        setTasks((prev) => mergeTasksForLoad(prev, localTasks, projects))

        // Fire Firestore request in background
        todoRepository
          .getTasks(userId, options)
          .then(async (remoteTasks) => {
            // Update IndexedDB with server data
            for (const task of remoteTasks) {
              await saveTaskLocally({ ...task, syncState: 'synced' })
            }
            // Update state
            setTasks((prev) => mergeTasksForLoad(prev, remoteTasks, projects))
          })
          .catch((err) => {
            logger.error('Failed to sync tasks from Firestore:', err)
          })

        lastUserIdRef.current = userId
      } catch (err) {
        logger.error('Failed to load tasks:', err)
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [userId, projects, todoRepository]
  )

  // --- Projects ---
  const createProject = useCallback(
    async (
      projectData: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
    ): Promise<string> => {
      const now = new Date().toISOString()
      const newProject: CanonicalProject = {
        ...projectData,
        id: generateId(),
        userId,
        createdAt: now,
        updatedAt: now,
      }

      // Save to IndexedDB immediately with 'pending' sync state
      const localProject: LocalProject = { ...newProject, syncState: 'pending' }
      await saveProjectLocally(localProject)

      // Queue operation in outbox
      await enqueueProjectOp('create', userId, newProject.id, {
        project: newProject,
      } as ProjectCreatePayload)

      // Optimistic update
      setProjects((prev) => [...prev, localProject])

      // Always attempt immediate sync - errors handled gracefully
      todoRepository.saveProject(newProject).catch((err) => {
        logger.error('Failed to sync project:', err)
        // Outbox will retry later
      })

      return newProject.id
    },
    [userId, todoRepository]
  )

  const deleteProject = useCallback(
    async (projectId: string) => {
      const projectToDelete = projects.find((p) => p.id === projectId)
      if (!projectToDelete) return

      // Delete from IndexedDB immediately
      await deleteProjectLocally(projectId)

      // Queue operation in outbox
      await enqueueProjectOp('delete', userId, projectId, {
        projectId,
      } as ProjectDeletePayload)

      // Optimistic update
      setProjects((prev) => prev.filter((p) => p.id !== projectId))

      // Always attempt immediate sync - errors handled gracefully
      todoRepository.deleteProject(userId, projectId).catch((err) => {
        logger.error('Failed to sync project deletion:', err)
        // Outbox will retry later
      })
    },
    [projects, userId, todoRepository]
  )

  // --- Chapters ---
  const createChapter = useCallback(
    async (chapterData: Omit<CanonicalChapter, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString()
      const newChapter: CanonicalChapter = {
        ...chapterData,
        id: generateId(),
        userId,
        createdAt: now,
        updatedAt: now,
      }

      // Save to IndexedDB immediately
      const localChapter: LocalChapter = { ...newChapter, syncState: 'pending' }
      await saveChapterLocally(localChapter)

      // Queue operation in outbox
      await enqueueChapterOp('create', userId, newChapter.id, {
        chapter: newChapter,
      } as ChapterCreatePayload)

      setChapters((prev) => [...prev, localChapter])

      // Always attempt immediate sync - errors handled gracefully
      todoRepository.saveChapter(newChapter).catch((err) => {
        logger.error('Failed to sync chapter:', err)
        // Outbox will retry later
      })
    },
    [userId, todoRepository]
  )

  const deleteChapter = useCallback(
    async (chapterId: string) => {
      const chapterToDelete = chapters.find((c) => c.id === chapterId)
      if (!chapterToDelete) return

      // Delete from IndexedDB immediately
      await deleteChapterLocally(chapterId)

      // Queue operation in outbox
      await enqueueChapterOp('delete', userId, chapterId, {
        chapterId,
      } as ChapterDeletePayload)

      setChapters((prev) => prev.filter((c) => c.id !== chapterId))

      // Always attempt immediate sync - errors handled gracefully
      todoRepository.deleteChapter(userId, chapterId).catch((err) => {
        logger.error('Failed to sync chapter deletion:', err)
        // Outbox will retry later
      })
    },
    [userId, chapters, todoRepository]
  )

  // --- Tasks ---
  const createTask = useCallback(
    async (
      taskData: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
      options?: { suppressToast?: boolean }
    ): Promise<CanonicalTask> => {
      const now = new Date().toISOString()
      const newTask: CanonicalTask = {
        ...taskData,
        id: generateId(),
        userId,
        createdAt: now,
        updatedAt: now,
      }
      const normalizedTask = normalizeTaskForSave(newTask, projects)

      // Save to IndexedDB immediately with 'pending' sync state
      const localTask: LocalTask = { ...normalizedTask, syncState: 'pending' }
      await saveTaskLocally(localTask)

      // Queue operation in outbox
      await enqueueTaskOp('create', userId, normalizedTask.id, {
        task: normalizedTask,
      } as TaskCreatePayload)

      // Optimistic update
      setTasks((prev) => [...prev, localTask])

      // Show success message
      if (!options?.suppressToast) {
        toast.success('Task created successfully')
      }

      // Always attempt immediate sync - errors handled gracefully
      todoRepository.saveTask(normalizedTask).catch((err) => {
        logger.error('Failed to sync task:', err)
        // Outbox will retry later
      })

      return normalizedTask
    },
    [userId, projects, todoRepository]
  )

  const updateTask = useCallback(
    async (task: CanonicalTask) => {
      const now = new Date().toISOString()
      const updatedTask = {
        ...task,
        updatedAt: now,
      }
      let normalizedTask = normalizeTaskForSave(updatedTask, projects)
      if (normalizedTask.completed) {
        normalizedTask = {
          ...normalizedTask,
          completedAt: normalizedTask.completedAt ?? now,
        }
      } else if (normalizedTask.completedAt) {
        normalizedTask = {
          ...normalizedTask,
          completedAt: undefined,
        }
      }

      // Save to IndexedDB immediately
      const localTask: LocalTask = { ...normalizedTask, syncState: 'pending' }
      await saveTaskLocally(localTask)

      // Queue operation in outbox
      await enqueueTaskOp('update', userId, normalizedTask.id, {
        taskId: normalizedTask.id,
        updates: normalizedTask,
      } as TaskUpdatePayload)

      // Optimistic update
      setTasks((prev) => prev.map((t) => (t.id === task.id ? localTask : t)))

      toast.success('Task updated successfully')

      // Always attempt immediate sync - errors handled gracefully
      todoRepository.saveTask(normalizedTask).catch((err) => {
        logger.error('Failed to sync task update:', err)
        // Outbox will retry later
      })
    },
    [userId, projects, todoRepository]
  )

  const deleteTask = useCallback(
    async (taskId: string) => {
      const taskToDelete = tasks.find((t) => t.id === taskId)
      if (!taskToDelete) return

      // Delete from IndexedDB immediately
      await deleteTaskLocally(taskId)

      // Queue operation in outbox
      await enqueueTaskOp('delete', userId, taskId, {
        taskId,
      } as TaskDeletePayload)

      setTasks((prev) => prev.filter((t) => t.id !== taskId))

      toast.success('Task deleted successfully')

      // Always attempt immediate sync - errors handled gracefully
      todoRepository.deleteTask(userId, taskId).catch((err) => {
        logger.error('Failed to sync task deletion:', err)
        // Outbox will retry later
      })
    },
    [userId, tasks, todoRepository]
  )

  const convertTaskToProject = useCallback(
    async (task: CanonicalTask) => {
      // 1. Create new project from task
      const projectData: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
        title: task.title,
        description: task.description,
        domain: task.domain,
        archived: false,
      }

      // We can reuse the existing createProject logic, but we need to await it
      // to ensure order if we were to do more complex things.
      // For now, calling the exposed createProject is fine, but we need to handle the promise.
      // However, createProject is async void in the hook return.
      // Let's just call it.
      await createProject(projectData)

      // 2. Delete the original task
      await deleteTask(task.id)

      // Note: In a real app, you might want to move sub-tasks or related items,
      // but for now this is a simple conversion.
    },
    [createProject, deleteTask]
  )

  return {
    projects,
    chapters,
    tasks,
    loading,
    error,
    loadData,
    loadTasks,
    createProject,
    deleteProject,
    createChapter,
    deleteChapter,
    createTask,
    updateTask,
    deleteTask,
    convertTaskToProject,
  }
}
