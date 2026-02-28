/**
 * useSchedulingLinks Hook
 *
 * Real-time CRUD for scheduling links stored at
 * /users/{userId}/schedulingLinks/{linkId}
 */

import { useState, useEffect, useCallback } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firestoreClient'
import { toast } from 'sonner'

export interface TimeWindow {
  start: string
  end: string
}

export interface WeeklyAvailability {
  mon: TimeWindow[]
  tue: TimeWindow[]
  wed: TimeWindow[]
  thu: TimeWindow[]
  fri: TimeWindow[]
  sat: TimeWindow[]
  sun: TimeWindow[]
}

export interface SchedulingLinkBranding {
  accentColor?: string
  welcomeMessage?: string
}

export interface SchedulingLink {
  id: string
  slug: string
  title: string
  description?: string
  durations: number[]
  defaultDuration: number
  calendarId: string
  accountId: string
  timezone: string
  availability: WeeklyAvailability
  bufferMinutes: number
  maxDaysAhead: number
  location?: string
  addConferencing: boolean
  branding?: SchedulingLinkBranding
  active: boolean
  createdAt: string
  updatedAt: string
}

const DEFAULT_AVAILABILITY: WeeklyAvailability = {
  mon: [{ start: '09:00', end: '17:00' }],
  tue: [{ start: '09:00', end: '17:00' }],
  wed: [{ start: '09:00', end: '17:00' }],
  thu: [{ start: '09:00', end: '17:00' }],
  fri: [{ start: '09:00', end: '17:00' }],
  sat: [],
  sun: [],
}

export function createDefaultLink(): SchedulingLink {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  return {
    id,
    slug: '',
    title: '',
    description: '',
    durations: [30],
    defaultDuration: 30,
    calendarId: '',
    accountId: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    availability: DEFAULT_AVAILABILITY,
    bufferMinutes: 0,
    maxDaysAhead: 30,
    location: '',
    addConferencing: true,
    branding: undefined,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function useSchedulingLinks(userId: string | undefined) {
  const [links, setLinks] = useState<SchedulingLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return

    let unsubscribe: (() => void) | undefined

    const setup = async () => {
      try {
        const db = await getFirestoreClient()
        const q = query(
          collection(db, 'users', userId, 'schedulingLinks'),
          orderBy('createdAt', 'desc')
        )
        unsubscribe = onSnapshot(
          q,
          (snap) => {
            setLinks(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as SchedulingLink))
            setLoading(false)
          },
          (err) => {
            setError(err.message)
            setLoading(false)
          }
        )
      } catch (err) {
        setError((err as Error).message)
        setLoading(false)
      }
    }

    void setup()
    return () => unsubscribe?.()
  }, [userId])

  const saveLink = useCallback(
    async (link: SchedulingLink) => {
      if (!userId) return
      try {
        const db = await getFirestoreClient()
        const ref = doc(db, 'users', userId, 'schedulingLinks', link.id)
        await setDoc(ref, { ...link, updatedAt: new Date().toISOString() }, { merge: true })
        toast.success('Scheduling link saved')
      } catch (err) {
        toast.error('Failed to save scheduling link')
        throw err
      }
    },
    [userId]
  )

  const deleteLink = useCallback(
    async (linkId: string) => {
      if (!userId) return
      try {
        const db = await getFirestoreClient()
        await deleteDoc(doc(db, 'users', userId, 'schedulingLinks', linkId))
        toast.success('Scheduling link deleted')
      } catch (err) {
        toast.error('Failed to delete scheduling link')
        throw err
      }
    },
    [userId]
  )

  const toggleActive = useCallback(
    async (linkId: string, active: boolean) => {
      if (!userId) return
      try {
        const db = await getFirestoreClient()
        const ref = doc(db, 'users', userId, 'schedulingLinks', linkId)
        await setDoc(ref, { active, updatedAt: new Date().toISOString() }, { merge: true })
        toast.success(active ? 'Link activated' : 'Link deactivated')
      } catch (err) {
        toast.error('Failed to update link status')
        throw err
      }
    },
    [userId]
  )

  return { links, loading, error, saveLink, deleteLink, toggleActive }
}
