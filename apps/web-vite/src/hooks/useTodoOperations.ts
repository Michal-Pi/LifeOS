import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@lifeos/calendar'
import { createFirestoreTodoRepository } from '@/adapters/firestoreTodoRepository'
import type { CanonicalProject, CanonicalMilestone, CanonicalTask } from '@/types/todo'
import { generateId } from '@/lib/idGenerator'
import { mergeTasksForLoad, normalizeTaskForSave } from '@/lib/todoRules'

const logger = createLogger('useTodoOperations')
const todoRepository = createFirestoreTodoRepository()

interface UseTodoOperationsProps {
  userId: string
}

export function useTodoOperations({ userId }: UseTodoOperationsProps) {
  const [projects, setProjects] = useState<CanonicalProject[]>([])
  const [milestones, setMilestones] = useState<CanonicalMilestone[]>([])
  const [tasks, setTasks] = useState<CanonicalTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastUserIdRef = useRef<string | null>(null)

  const loadData = useCallback(async (options?: { includeTasks?: boolean }) => {
    if (!userId) return
    if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
      setProjects([])
      setMilestones([])
      setTasks([])
    }
    setLoading(true)
    try {
      const includeTasks = options?.includeTasks !== false
      const [loadedProjects, loadedMilestones, loadedTasks] = await Promise.all([
        todoRepository.getProjects(userId),
        todoRepository.getMilestones(userId),
        includeTasks ? todoRepository.getTasks(userId) : Promise.resolve([])
      ])
      setProjects(loadedProjects)
      setMilestones(loadedMilestones)
      if (includeTasks) {
        setTasks(prev => mergeTasksForLoad(prev, loadedTasks, loadedProjects))
      }
      lastUserIdRef.current = userId
    } catch (err) {
      logger.error('Failed to load todo data:', err)
      const errorMessage = (err as Error).message
      setError(errorMessage)
      toast.error('Failed to load data', {
        description: errorMessage
      })
    } finally {
      setLoading(false)
    }
  }, [userId])

  const loadTasks = useCallback(async (options?: { projectId?: string; milestoneId?: string }) => {
    if (!userId) return
    if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
      setProjects([])
      setMilestones([])
      setTasks([])
    }
    setLoading(true)
    try {
      const loadedTasks = await todoRepository.getTasks(userId, options)
      setTasks(prev => mergeTasksForLoad(prev, loadedTasks, projects))
      lastUserIdRef.current = userId
    } catch (err) {
      logger.error('Failed to load tasks:', err)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId, projects])

  // --- Projects ---
  const createProject = useCallback(async (projectData: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newProject: CanonicalProject = {
      ...projectData,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now
    }

    // Optimistic update
    setProjects(prev => [...prev, newProject])

    try {
      await todoRepository.saveProject(newProject)
    } catch (err) {
      logger.error('Failed to create project:', err)
      setError((err as Error).message)
      // Revert optimistic update
      setProjects(prev => prev.filter(p => p.id !== newProject.id))
    }
  }, [userId])

  const deleteProject = useCallback(async (projectId: string) => {
    const projectToDelete = projects.find(p => p.id === projectId)
    if (!projectToDelete) return

    // Optimistic update
    setProjects(prev => prev.filter(p => p.id !== projectId))

    try {
      await todoRepository.deleteProject(userId, projectId)
    } catch (err) {
      logger.error('Failed to delete project:', err)
      setError((err as Error).message)
      // Revert optimistic update
      setProjects(prev => [...prev, projectToDelete])
    }
  }, [projects])

  // --- Milestones ---
  const createMilestone = useCallback(async (milestoneData: Omit<CanonicalMilestone, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newMilestone: CanonicalMilestone = {
      ...milestoneData,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now
    }

    setMilestones(prev => [...prev, newMilestone])

    try {
      await todoRepository.saveMilestone(newMilestone)
    } catch (err) {
      logger.error('Failed to create milestone:', err)
      setError((err as Error).message)
      setMilestones(prev => prev.filter(m => m.id !== newMilestone.id))
    }
  }, [userId])

  const deleteMilestone = useCallback(async (milestoneId: string) => {
    const milestoneToDelete = milestones.find(m => m.id === milestoneId)
    if (!milestoneToDelete) return

    setMilestones(prev => prev.filter(m => m.id !== milestoneId))

    try {
      await todoRepository.deleteMilestone(userId, milestoneId)
    } catch (err) {
      logger.error('Failed to delete milestone:', err)
      setError((err as Error).message)
      setMilestones(prev => [...prev, milestoneToDelete])
    }
  }, [userId, milestones])

  // --- Tasks ---
  const createTask = useCallback(async (taskData: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newTask: CanonicalTask = {
      ...taskData,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now
    }
    const normalizedTask = normalizeTaskForSave(newTask, projects)

    setTasks(prev => [...prev, normalizedTask])

    try {
      await todoRepository.saveTask(normalizedTask)
      toast.success('Task created successfully')
    } catch (err) {
      logger.error('Failed to create task:', err)
      const errorMessage = (err as Error).message
      setError(errorMessage)
      setTasks(prev => prev.filter(t => t.id !== normalizedTask.id))
      toast.error('Failed to create task', {
        description: errorMessage
      })
    }
  }, [userId, projects])

  const updateTask = useCallback(async (task: CanonicalTask) => {
    const updatedTask = {
      ...task,
      updatedAt: new Date().toISOString()
    }
    const normalizedTask = normalizeTaskForSave(updatedTask, projects)

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? normalizedTask : t))

    try {
      await todoRepository.saveTask(normalizedTask)
      toast.success('Task updated successfully')
    } catch (err) {
      logger.error('Failed to update task:', err)
      const errorMessage = (err as Error).message
      setError(errorMessage)
      // Revert optimistic update
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      toast.error('Failed to update task', {
        description: errorMessage
      })
    }
  }, [userId, projects])

  const deleteTask = useCallback(async (taskId: string) => {
    const taskToDelete = tasks.find(t => t.id === taskId)
    if (!taskToDelete) return

    setTasks(prev => prev.filter(t => t.id !== taskId))

    try {
      await todoRepository.deleteTask(userId, taskId)
      toast.success('Task deleted successfully')
    } catch (err) {
      logger.error('Failed to delete task:', err)
      const errorMessage = (err as Error).message
      setError(errorMessage)
      setTasks(prev => [...prev, taskToDelete])
      toast.error('Failed to delete task', {
        description: errorMessage
      })
    }
  }, [userId, tasks])

  const convertTaskToProject = useCallback(async (task: CanonicalTask) => {
    // 1. Create new project from task
    const projectData: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
      title: task.title,
      description: task.description,
      domain: task.domain,
      archived: false
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
  }, [createProject, deleteTask])

  return {
    projects,
    milestones,
    tasks,
    loading,
    error,
    loadData,
    loadTasks,
    createProject,
    deleteProject,
    createMilestone,
    deleteMilestone,
    createTask,
    updateTask,
    deleteTask,
    convertTaskToProject
  }
}
