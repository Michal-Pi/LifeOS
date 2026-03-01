/**
 * useUpcomingBookings Hook
 *
 * Real-time listener for upcoming confirmed bookings across all scheduling links.
 * Firestore path: /users/{userId}/schedulingLinks/{linkId}/bookings/{bookingId}
 */

import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firestoreClient'
import type { SchedulingLink } from '@/hooks/useSchedulingLinks'

export interface Booking {
  id: string
  linkId: string
  guestName: string
  guestEmail: string
  guestNotes?: string
  /** ISO 8601 */
  startTime: string
  /** ISO 8601 */
  endTime: string
  /** Duration in minutes */
  duration: number
  /** Guest's IANA timezone */
  timezone: string
  /** Google Calendar event ID after creation */
  googleEventId?: string
  status: 'confirmed' | 'cancelled'
  /** ISO 8601 */
  createdAt: string
}

export function useUpcomingBookings(
  userId: string | undefined,
  links: SchedulingLink[]
) {
  const hasLinks = links.length > 0
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId || !hasLinks) {
      return
    }

    const unsubscribes: (() => void)[] = []
    const bookingsByLink = new Map<string, Booking[]>()
    let pendingSetups = links.length

    const mergeAndUpdate = () => {
      const all: Booking[] = []
      for (const arr of bookingsByLink.values()) {
        all.push(...arr)
      }
      all.sort((a, b) => a.startTime.localeCompare(b.startTime))
      setBookings(all)
    }

    const setup = async () => {
      try {
        const db = await getFirestoreClient()
        const now = new Date().toISOString()

        for (const link of links) {
          const q = query(
            collection(db, 'users', userId, 'schedulingLinks', link.id, 'bookings'),
            where('status', '==', 'confirmed'),
            where('startTime', '>=', now),
            orderBy('startTime', 'asc')
          )

          const unsub = onSnapshot(
            q,
            (snap) => {
              bookingsByLink.set(
                link.id,
                snap.docs.map((d) => ({ ...d.data(), id: d.id } as Booking))
              )
              pendingSetups = Math.max(0, pendingSetups - 1)
              if (pendingSetups === 0) setLoading(false)
              mergeAndUpdate()
            },
            () => {
              // On error, just set empty for this link
              bookingsByLink.set(link.id, [])
              pendingSetups = Math.max(0, pendingSetups - 1)
              if (pendingSetups === 0) setLoading(false)
              mergeAndUpdate()
            }
          )
          unsubscribes.push(unsub)
        }
      } catch {
        setLoading(false)
      }
    }

    void setup()

    return () => {
      for (const unsub of unsubscribes) unsub()
    }
  }, [userId, hasLinks, links])

  const shouldSubscribe = !!userId && hasLinks
  return {
    bookings: shouldSubscribe ? bookings : [],
    loading: shouldSubscribe ? loading : false,
  }
}
