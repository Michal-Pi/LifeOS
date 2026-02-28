import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listEventsWithRecurrence,
  type CanonicalCalendarEvent,
  type RecurrenceInstance,
  createLogger,
} from '@lifeos/calendar'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { listEventsByRangeLocally, bulkSaveEventsLocally } from '@/calendar/offlineStore'
import { collection, query, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { toast } from 'sonner'

const logger = createLogger('useCalendarEvents')
const calendarRepository = createFirestoreCalendarEventRepository()

export function useCalendarEvents(userId: string, dayKeys: string[]) {
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [instances, setInstances] = useState<RecurrenceInstance[]>([])
  const [loading, setLoading] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ total: number; isActive: boolean } | null>(
    null
  )
  const unsubscribeRef = useRef<Unsubscribe | null>(null)

  const getRangeFromDayKeys = useCallback(() => {
    if (dayKeys.length === 0) {
      return null
    }
    const sortedKeys = [...dayKeys].sort()
    const start = new Date(`${sortedKeys[0]}T00:00:00`)
    const end = new Date(`${sortedKeys[sortedKeys.length - 1]}T23:59:59.999`)
    return { startMs: start.getTime(), endMs: end.getTime() }
  }, [dayKeys])

  // Memoize the load function so it can be exposed for manual refreshing
  const loadEvents = useCallback(async () => {
    if (!userId) return
    const range = getRangeFromDayKeys()
    if (!range) return

    setLoading(true)
    try {
      // 1. Read from IndexedDB first for instant display
      try {
        const localEvents = await listEventsByRangeLocally(userId, range.startMs, range.endMs)
        if (localEvents.length > 0) {
          setEvents(localEvents)
          setLoading(false)
        }
      } catch {
        /* ignore local read failure */
      }

      // 2. Fetch from Firestore in background
      const items = await listEventsWithRecurrence(
        { repository: calendarRepository },
        { userId, startMs: range.startMs, endMs: range.endMs }
      )
      const eventMap = new Map<string, CanonicalCalendarEvent>()
      const nextInstances: RecurrenceInstance[] = []

      for (const item of items) {
        if (item.sourceEvent) {
          eventMap.set(item.sourceEvent.canonicalEventId, item.sourceEvent)
        }
        if (item.type === 'instance' && item.sourceInstance) {
          nextInstances.push(item.sourceInstance)
        }
      }

      const freshEvents = Array.from(eventMap.values())
      setEvents(freshEvents)
      setInstances(nextInstances)

      // 3. Cache results locally
      void bulkSaveEventsLocally(freshEvents)
    } catch (error) {
      logger.error('Failed to load events from Firestore', error)
      // Keep whatever we already have (local cache or empty)
    } finally {
      setLoading(false)
    }
  }, [userId, getRangeFromDayKeys])

  // Set up real-time listener for events collection to detect deletions
  useEffect(() => {
    if (!userId) return

    let active = true
    let reloadTimeout: NodeJS.Timeout | null = null
    let lastTotalCount = 0
    let initialTotalCount = 0
    let bulkDeleteInProgress = false
    let syncStartCount = 0
    let lastAddedCount = 0
    let syncNotificationShown = false
    let isInitialSnapshot = true
    let initialSnapshotTime = 0

    const setupListener = async () => {
      // Ensure Firestore auth is ready before setting up listener
      const { getAuthClient } = await import('@/lib/firebase')
      const auth = getAuthClient()
      const maxWaitMs = 1000
      const startTime = Date.now()
      while (Date.now() - startTime < maxWaitMs) {
        const currentUser = auth.currentUser
        if (currentUser && currentUser.uid === userId) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      const db = await getDb()
      const eventsCol = collection(db, 'users', userId, 'calendarEvents')

      const q = query(eventsCol)

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!active) return

          if (isInitialSnapshot) {
            isInitialSnapshot = false
            initialSnapshotTime = Date.now()
            initialTotalCount = snapshot.size
            lastTotalCount = snapshot.size
            return
          }

          const changes = snapshot.docChanges()
          const hasRemovals = changes.some((change) => change.type === 'removed')
          const removedCount = changes.filter((c) => c.type === 'removed').length
          const addedCount = changes.filter((c) => c.type === 'added').length
          const currentTotal = snapshot.size

          const isCatchUpPhase = Date.now() - initialSnapshotTime < 5000
          const isHistoricalBulkDelete =
            isCatchUpPhase &&
            removedCount >= 25 &&
            currentTotal < initialTotalCount &&
            currentTotal <= lastTotalCount

          // Detect start of bulk sync
          if (addedCount >= 50 && syncStartCount === 0) {
            syncStartCount = currentTotal - addedCount
            syncNotificationShown = false
          }

          const isBulkDelete =
            removedCount >= 25 || (lastTotalCount > 0 && lastTotalCount - currentTotal >= 25)

          if (isBulkDelete && !bulkDeleteInProgress) {
            bulkDeleteInProgress = true
            if (!isHistoricalBulkDelete) {
              logger.info('Bulk delete detected, suppressing reloads temporarily', {
                removedCount,
                totalBefore: lastTotalCount,
                totalAfter: currentTotal,
              })
            }
          }

          // Sync progress tracking
          const syncInProgress = addedCount >= 10

          if (syncInProgress) {
            setSyncProgress({ total: currentTotal, isActive: true })
          } else if (syncStartCount > 0 && currentTotal > syncStartCount + 100) {
            if (!syncNotificationShown) {
              const totalSynced = currentTotal - syncStartCount
              if (totalSynced > 1000) {
                toast.success(`Sync complete - ${totalSynced.toLocaleString()} events loaded`)
              }
              syncNotificationShown = true
            }
            syncStartCount = 0
            setTimeout(() => setSyncProgress(null), 2000)
          } else if (lastAddedCount >= 10 && addedCount < 10) {
            setTimeout(() => setSyncProgress(null), 2000)
          } else if (addedCount === 0 && lastAddedCount > 0) {
            setTimeout(() => setSyncProgress(null), 2000)
          }

          if (!isHistoricalBulkDelete) {
            logger.info('Events snapshot received', {
              total: currentTotal,
              added: addedCount,
              removed: removedCount,
              modified: changes.filter((c) => c.type === 'modified').length,
              hasRemovals,
              isBulkDelete,
              bulkDeleteInProgress,
              syncInProgress,
              syncStartCount,
              active,
            })
          } else {
            logger.debug('Catching up with historical deletions', {
              total: currentTotal,
              removed: removedCount,
            })
          }

          lastTotalCount = currentTotal
          lastAddedCount = addedCount

          if (hasRemovals && !bulkDeleteInProgress) {
            logger.info('Events deleted, reloading')
            if (reloadTimeout) {
              clearTimeout(reloadTimeout)
            }
            reloadTimeout = setTimeout(() => {
              if (active) {
                void loadEvents()
              }
            }, 500)
          } else if (hasRemovals && bulkDeleteInProgress) {
            if (reloadTimeout) {
              clearTimeout(reloadTimeout)
            }
            reloadTimeout = setTimeout(() => {
              if (active) {
                bulkDeleteInProgress = false
                if (!isHistoricalBulkDelete) {
                  logger.info('Bulk delete complete, reloading events')
                }
                void loadEvents()
              }
            }, 2000)
          } else if (!hasRemovals && bulkDeleteInProgress) {
            bulkDeleteInProgress = false
            if (!isHistoricalBulkDelete) {
              logger.info('Bulk delete finished, reloading events')
            }
            if (reloadTimeout) {
              clearTimeout(reloadTimeout)
            }
            reloadTimeout = setTimeout(() => {
              if (active) {
                void loadEvents()
              }
            }, 500)
          }
        },
        (error: Error) => {
          logger.error('Events listener error', error)
        }
      )

      if (active) {
        unsubscribeRef.current = unsubscribe
      } else {
        unsubscribe()
      }
    }

    void setupListener()

    return () => {
      active = false
      if (reloadTimeout) {
        clearTimeout(reloadTimeout)
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [userId, loadEvents])

  // Initial load when dependencies change
  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  return { events, instances, setEvents, loading, reload: loadEvents, syncProgress }
}
