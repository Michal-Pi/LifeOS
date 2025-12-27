/**
 * Firestore Todo Repository
 *
 * Implements data access for Projects, Milestones, and Tasks using Firestore.
 * Follows the Repository pattern to abstract database specifics from the UI.
 */

import { collection, doc, getDocs, query, setDoc, where, deleteDoc } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import type { CanonicalProject, CanonicalMilestone, CanonicalTask } from '@/types/todo'

const COLLECTION_PROJECTS = 'projects'
const COLLECTION_MILESTONES = 'milestones'
const COLLECTION_TASKS = 'tasks'

export const createFirestoreTodoRepository = () => {
  const db = getFirestoreClient()

  // --- Projects ---
  const getProjects = async (userId: string): Promise<CanonicalProject[]> => {
    const q = query(collection(db, `users/${userId}/${COLLECTION_PROJECTS}`))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalProject)
  }

  const saveProject = async (project: CanonicalProject): Promise<void> => {
    const ref = doc(db, `users/${project.userId}/${COLLECTION_PROJECTS}/${project.id}`)
    await setDoc(ref, project)
  }

  const deleteProject = async (userId: string, projectId: string): Promise<void> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_PROJECTS}/${projectId}`)
    await deleteDoc(ref)
  }

  // --- Milestones ---
  const getMilestones = async (
    userId: string,
    projectId?: string
  ): Promise<CanonicalMilestone[]> => {
    let q = query(collection(db, `users/${userId}/${COLLECTION_MILESTONES}`))
    if (projectId) {
      q = query(q, where('projectId', '==', projectId))
    }
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalMilestone)
  }

  const saveMilestone = async (milestone: CanonicalMilestone): Promise<void> => {
    const ref = doc(db, `users/${milestone.userId}/${COLLECTION_MILESTONES}/${milestone.id}`)
    await setDoc(ref, milestone)
  }

  const deleteMilestone = async (userId: string, milestoneId: string): Promise<void> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_MILESTONES}/${milestoneId}`)
    await deleteDoc(ref)
  }

  // --- Tasks ---
  const getTasks = async (
    userId: string,
    options?: { projectId?: string; milestoneId?: string }
  ): Promise<CanonicalTask[]> => {
    let q = query(collection(db, `users/${userId}/${COLLECTION_TASKS}`))
    if (options?.milestoneId) {
      q = query(q, where('milestoneId', '==', options.milestoneId))
    } else if (options?.projectId) {
      q = query(q, where('projectId', '==', options.projectId))
    }
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalTask)
  }

  const saveTask = async (task: CanonicalTask): Promise<void> => {
    const ref = doc(db, `users/${task.userId}/${COLLECTION_TASKS}/${task.id}`)
    await setDoc(ref, task)
  }

  const deleteTask = async (userId: string, taskId: string): Promise<void> => {
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
