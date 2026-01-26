/**
 * Offline Storage for Todos
 *
 * IndexedDB schema for storing projects, chapters, and tasks locally when offline.
 * Provides full CRUD operations with sync state tracking.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { CanonicalProject, CanonicalChapter, CanonicalTask } from '@/types/todo'

const DB_NAME = 'lifeos-todos'
const DB_VERSION = 1

// Store names
const PROJECTS_STORE = 'projects'
const CHAPTERS_STORE = 'chapters'
const TASKS_STORE = 'tasks'

// Extended types with sync state
export type SyncState = 'local' | 'pending' | 'syncing' | 'synced' | 'failed'

export interface LocalProject extends CanonicalProject {
  syncState?: SyncState
}

export interface LocalChapter extends CanonicalChapter {
  syncState?: SyncState
}

export interface LocalTask extends CanonicalTask {
  syncState?: SyncState
}

let dbPromise: Promise<IDBPDatabase> | null = null

/**
 * Open or create the todos database
 */
async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Projects store
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const projectsStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
          projectsStore.createIndex('userId', 'userId')
          projectsStore.createIndex('domain', 'domain')
          projectsStore.createIndex('archived', 'archived')
          projectsStore.createIndex('syncState', 'syncState')
          projectsStore.createIndex('userId_archived', ['userId', 'archived'])
        }

        // Chapters store
        if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
          const chaptersStore = db.createObjectStore(CHAPTERS_STORE, { keyPath: 'id' })
          chaptersStore.createIndex('userId', 'userId')
          chaptersStore.createIndex('projectId', 'projectId')
          chaptersStore.createIndex('archived', 'archived')
          chaptersStore.createIndex('syncState', 'syncState')
          chaptersStore.createIndex('userId_projectId', ['userId', 'projectId'])
        }

        // Tasks store
        if (!db.objectStoreNames.contains(TASKS_STORE)) {
          const tasksStore = db.createObjectStore(TASKS_STORE, { keyPath: 'id' })
          tasksStore.createIndex('userId', 'userId')
          tasksStore.createIndex('projectId', 'projectId')
          tasksStore.createIndex('chapterId', 'chapterId')
          tasksStore.createIndex('domain', 'domain')
          tasksStore.createIndex('status', 'status')
          tasksStore.createIndex('completed', 'completed')
          tasksStore.createIndex('archived', 'archived')
          tasksStore.createIndex('syncState', 'syncState')
          tasksStore.createIndex('userId_projectId', ['userId', 'projectId'])
          tasksStore.createIndex('userId_chapterId', ['userId', 'chapterId'])
          tasksStore.createIndex('userId_completed', ['userId', 'completed'])
          tasksStore.createIndex('userId_archived', ['userId', 'archived'])
        }
      },
    })
  }
  return dbPromise
}

export function __resetTodosDbForTests(): void {
  dbPromise = null
}

// ============================================================================
// Projects Operations
// ============================================================================

/**
 * Save or update a project in local storage
 */
export async function saveProjectLocally(project: LocalProject): Promise<void> {
  if (!project.userId || project.userId.trim() === '') {
    return
  }
  const db = await getDb()
  await db.put(PROJECTS_STORE, project)
}

/**
 * Get a project from local storage
 */
export async function getProjectLocally(projectId: string): Promise<LocalProject | undefined> {
  const db = await getDb()
  return db.get(PROJECTS_STORE, projectId)
}

/**
 * Delete a project from local storage
 */
export async function deleteProjectLocally(projectId: string): Promise<void> {
  const db = await getDb()
  await db.delete(PROJECTS_STORE, projectId)
}

/**
 * List all projects for a user
 */
export async function listProjectsLocally(userId: string): Promise<LocalProject[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(PROJECTS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * Get projects that need syncing (not in 'synced' state)
 */
export async function getUnsyncedProjects(userId: string): Promise<LocalProject[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const store = db.transaction(PROJECTS_STORE, 'readonly').store
  const index = store.index('userId')
  const projects = await index.getAll(userId)

  return projects.filter((project) => project.syncState !== 'synced')
}

// ============================================================================
// Chapters Operations
// ============================================================================

/**
 * Save or update a chapter in local storage
 */
export async function saveChapterLocally(chapter: LocalChapter): Promise<void> {
  if (!chapter.userId || chapter.userId.trim() === '') {
    return
  }
  const db = await getDb()
  await db.put(CHAPTERS_STORE, chapter)
}

/**
 * Get a chapter from local storage
 */
export async function getChapterLocally(chapterId: string): Promise<LocalChapter | undefined> {
  const db = await getDb()
  return db.get(CHAPTERS_STORE, chapterId)
}

/**
 * Delete a chapter from local storage
 */
export async function deleteChapterLocally(chapterId: string): Promise<void> {
  const db = await getDb()
  await db.delete(CHAPTERS_STORE, chapterId)
}

/**
 * List all chapters for a user
 */
export async function listChaptersLocally(userId: string): Promise<LocalChapter[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(CHAPTERS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * List chapters by project
 */
export async function listChaptersByProjectLocally(
  userId: string,
  projectId: string
): Promise<LocalChapter[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(CHAPTERS_STORE).store.index('userId_projectId')
  return index.getAll([userId, projectId])
}

/**
 * Get chapters that need syncing
 */
export async function getUnsyncedChapters(userId: string): Promise<LocalChapter[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const store = db.transaction(CHAPTERS_STORE, 'readonly').store
  const index = store.index('userId')
  const chapters = await index.getAll(userId)

  return chapters.filter((chapter) => chapter.syncState !== 'synced')
}

// ============================================================================
// Tasks Operations
// ============================================================================

/**
 * Save or update a task in local storage
 */
export async function saveTaskLocally(task: LocalTask): Promise<void> {
  if (!task.userId || task.userId.trim() === '') {
    return
  }
  const db = await getDb()
  await db.put(TASKS_STORE, task)
}

/**
 * Get a task from local storage
 */
export async function getTaskLocally(taskId: string): Promise<LocalTask | undefined> {
  const db = await getDb()
  return db.get(TASKS_STORE, taskId)
}

/**
 * Delete a task from local storage
 */
export async function deleteTaskLocally(taskId: string): Promise<void> {
  const db = await getDb()
  await db.delete(TASKS_STORE, taskId)
}

/**
 * List all tasks for a user
 */
export async function listTasksLocally(userId: string): Promise<LocalTask[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(TASKS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * List tasks by project
 */
export async function listTasksByProjectLocally(
  userId: string,
  projectId: string
): Promise<LocalTask[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(TASKS_STORE).store.index('userId_projectId')
  return index.getAll([userId, projectId])
}

/**
 * List tasks by chapter
 */
export async function listTasksByChapterLocally(
  userId: string,
  chapterId: string
): Promise<LocalTask[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(TASKS_STORE).store.index('userId_chapterId')
  return index.getAll([userId, chapterId])
}

/**
 * Get tasks that need syncing
 */
export async function getUnsyncedTasks(userId: string): Promise<LocalTask[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const store = db.transaction(TASKS_STORE, 'readonly').store
  const index = store.index('userId')
  const tasks = await index.getAll(userId)

  return tasks.filter((task) => task.syncState !== 'synced')
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Clear all local data (use with caution!)
 */
export async function clearAllLocalData(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction([PROJECTS_STORE, CHAPTERS_STORE, TASKS_STORE], 'readwrite')

  await Promise.all([
    tx.objectStore(PROJECTS_STORE).clear(),
    tx.objectStore(CHAPTERS_STORE).clear(),
    tx.objectStore(TASKS_STORE).clear(),
  ])

  await tx.done
}

/**
 * Get storage statistics
 */
export async function getStorageStats(userId: string): Promise<{
  totalProjects: number
  totalChapters: number
  totalTasks: number
  unsyncedProjects: number
  unsyncedChapters: number
  unsyncedTasks: number
}> {
  if (!userId || userId.trim() === '') {
    return {
      totalProjects: 0,
      totalChapters: 0,
      totalTasks: 0,
      unsyncedProjects: 0,
      unsyncedChapters: 0,
      unsyncedTasks: 0,
    }
  }

  const [projects, chapters, tasks, unsyncedProjects, unsyncedChapters, unsyncedTasks] =
    await Promise.all([
      listProjectsLocally(userId),
      listChaptersLocally(userId),
      listTasksLocally(userId),
      getUnsyncedProjects(userId),
      getUnsyncedChapters(userId),
      getUnsyncedTasks(userId),
    ])

  return {
    totalProjects: projects.length,
    totalChapters: chapters.length,
    totalTasks: tasks.length,
    unsyncedProjects: unsyncedProjects.length,
    unsyncedChapters: unsyncedChapters.length,
    unsyncedTasks: unsyncedTasks.length,
  }
}
