/**
 * Firestore Todo Repository
 *
 * Implements data access for Projects, Milestones, and Tasks using Firestore.
 * Follows the Repository pattern to abstract database specifics from the UI.
 */

import { collection, doc, getDocs, query, setDoc, where, deleteDoc } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { getAuthClient } from '@/lib/firebase'
import type { CanonicalProject, CanonicalMilestone, CanonicalTask } from '@/types/todo'

const COLLECTION_PROJECTS = 'projects'
const COLLECTION_MILESTONES = 'milestones'
const COLLECTION_TASKS = 'tasks'

/**
 * Ensures Firestore has the auth token before making queries.
 * Waits for the current user to match the expected userId.
 */
async function ensureFirestoreAuthReady(userId: string, maxWaitMs: number = 1000): Promise<void> {
  const startTime = Date.now()
  const auth = getAuthClient()

  while (Date.now() - startTime < maxWaitMs) {
    const currentUser = auth.currentUser
    if (currentUser && currentUser.uid === userId) {
      // Verify token is available
      try {
        await currentUser.getIdToken()
        return
      } catch {
        // Token fetch failed, continue waiting
      }
    }
    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  // If we timeout, proceed anyway - the retry logic will handle permission errors
}

/**
 * Helper function to retry Firestore queries that fail with permission errors.
 * This handles race conditions where the auth token hasn't propagated to Firestore yet.
 */
async function retryFirestoreQuery<T>(
  queryFn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await queryFn()
    } catch (err: unknown) {
      const error = err as Error & { code?: string }
      lastError = error
      // Check for permission errors - Firebase uses 'permission-denied' code
      // Also check error message for "Missing or insufficient permissions"
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.code === 'PERMISSION_DENIED' ||
        (error?.message && error.message.includes('Missing or insufficient permissions'))

      if (isPermissionError && attempt < maxRetries - 1) {
        // Wait exponentially: 100ms, 200ms, 400ms
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)))
        continue
      }
      // Otherwise, throw the error
      throw err
    }
  }
  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Failed after retries')
}

export const createFirestoreTodoRepository = () => {
  // --- Projects ---
  const getProjects = async (userId: string): Promise<CanonicalProject[]> => {
    // Ensure Firestore auth is ready before making queries
    await ensureFirestoreAuthReady(userId)
    const db = await getDb()
    const q = query(collection(db, `users/${userId}/${COLLECTION_PROJECTS}`))
    return retryFirestoreQuery(async () => {
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as CanonicalProject)
    })
  }

  const saveProject = async (project: CanonicalProject): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${project.userId}/${COLLECTION_PROJECTS}/${project.id}`)
    await setDoc(ref, project)
  }

  const deleteProject = async (userId: string, projectId: string): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_PROJECTS}/${projectId}`)
    await deleteDoc(ref)
  }

  // --- Milestones ---
  const getMilestones = async (
    userId: string,
    projectId?: string
  ): Promise<CanonicalMilestone[]> => {
    // Ensure Firestore auth is ready before making queries
    await ensureFirestoreAuthReady(userId)
    const db = await getDb()
    let q = query(collection(db, `users/${userId}/${COLLECTION_MILESTONES}`))
    if (projectId) {
      q = query(q, where('projectId', '==', projectId))
    }
    return retryFirestoreQuery(async () => {
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as CanonicalMilestone)
    })
  }

  const saveMilestone = async (milestone: CanonicalMilestone): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${milestone.userId}/${COLLECTION_MILESTONES}/${milestone.id}`)
    await setDoc(ref, milestone)
  }

  const deleteMilestone = async (userId: string, milestoneId: string): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_MILESTONES}/${milestoneId}`)
    await deleteDoc(ref)
  }

  // --- Tasks ---
  const getTasks = async (
    userId: string,
    options?: { projectId?: string; milestoneId?: string }
  ): Promise<CanonicalTask[]> => {
    // Ensure Firestore auth is ready before making queries
    await ensureFirestoreAuthReady(userId)
    const db = await getDb()
    let q = query(collection(db, `users/${userId}/${COLLECTION_TASKS}`))
    if (options?.milestoneId) {
      q = query(q, where('milestoneId', '==', options.milestoneId))
    } else if (options?.projectId) {
      q = query(q, where('projectId', '==', options.projectId))
    }
    return retryFirestoreQuery(async () => {
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as CanonicalTask)
    })
  }

  const saveTask = async (task: CanonicalTask): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${task.userId}/${COLLECTION_TASKS}/${task.id}`)
    await setDoc(ref, task)
  }

  const deleteTask = async (userId: string, taskId: string): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_TASKS}/${taskId}`)
    await deleteDoc(ref)
  }

  return {
    getProjects,
    saveProject,
    deleteProject,
    getMilestones,
    saveMilestone,
    deleteMilestone,
    getTasks,
    saveTask,
    deleteTask,
  }
}
