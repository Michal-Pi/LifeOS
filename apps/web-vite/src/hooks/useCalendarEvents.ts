import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listEventsWithRecurrence,
  type CanonicalCalendarEvent,
  type RecurrenceInstance,
  createLogger,
} from '@lifeos/calendar'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
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

      setEvents(Array.from(eventMap.values()))
      setInstances(nextInstances)
    } catch (error) {
      logger.error('Failed to load events', error)
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

      // Listen to all events in the collection to detect deletions
      // We could optimize this by filtering, but for deletions we need broad coverage
      const q = query(eventsCol)

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!active) {
            logger.info('Listener fired but component inactive, skipping')
            return
          }

          // Track initial snapshot to detect catch-up phase
          if (isInitialSnapshot) {
            isInitialSnapshot = false
            initialSnapshotTime = Date.now()
            initialTotalCount = snapshot.size
            lastTotalCount = snapshot.size
            // Suppress verbose logging for initial snapshot - it's just catching up
            return
          }

          // Only reload if there were deletions
          // Ignore additions (sync operations) to prevent reload loops
          const changes = snapshot.docChanges()
          const hasRemovals = changes.some((change) => change.type === 'removed')
          const removedCount = changes.filter((c) => c.type === 'removed').length
          const addedCount = changes.filter((c) => c.type === 'added').length
          const currentTotal = snapshot.size

          // If we're still in catch-up phase (first few seconds after initial snapshot),
          // suppress verbose logging for bulk operations that are likely historical
          // Historical bulk deletes are detected by: catch-up phase + large removals + total decreasing from initial
          const isCatchUpPhase = Date.now() - initialSnapshotTime < 5000 // 5 seconds catch-up window
          const isHistoricalBulkDelete =
            isCatchUpPhase &&
            removedCount >= 25 &&
            currentTotal < initialTotalCount &&
            currentTotal <= lastTotalCount

          // Detect start of bulk sync (many additions)
          if (addedCount >= 50 && syncStartCount === 0) {
            syncStartCount = currentTotal - addedCount
            syncNotificationShown = false
          }

          // Detect bulk delete: large number of removals or significant drop in total count
          const isBulkDelete =
            removedCount >= 25 || (lastTotalCount > 0 && lastTotalCount - currentTotal >= 25)

          if (isBulkDelete && !bulkDeleteInProgress) {
            bulkDeleteInProgress = true
            // Only log if not a historical catch-up
            if (!isHistoricalBulkDelete) {
              logger.info('Bulk delete detected, suppressing reloads temporarily', {
                removedCount,
                totalBefore: lastTotalCount,
                totalAfter: currentTotal,
              })
            }
          }

          // Detect sync in progress: active additions happening
          const syncInProgress = addedCount >= 10

          if (syncInProgress) {
            // Update sync progress indicator
            setSyncProgress({ total: currentTotal, isActive: true })
          } else if (syncStartCount > 0 && currentTotal > syncStartCount + 100) {
            // Large sync complete (1000+ events)
            if (!syncNotificationShown) {
              const totalSynced = currentTotal - syncStartCount
              if (totalSynced > 1000) {
                toast.success(`Sync complete - ${totalSynced.toLocaleString()} events loaded`)
              }
              syncNotificationShown = true
            }
            syncStartCount = 0
            // Clear progress indicator after a delay
            setTimeout(() => setSyncProgress(null), 2000)
          } else if (lastAddedCount >= 10 && addedCount < 10) {
            // Sync just finished (transition from active to inactive)
            setTimeout(() => setSyncProgress(null), 2000)
          } else if (addedCount === 0 && lastAddedCount > 0) {
            // No more additions - sync is complete
            setTimeout(() => setSyncProgress(null), 2000)
          }

          // Suppress verbose logging during catch-up phase for historical bulk deletes
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
            // Only log a summary for historical catch-up
            logger.debug('Catching up with historical deletions', {
              total: currentTotal,
              removed: removedCount,
            })
          }

          lastTotalCount = currentTotal
          lastAddedCount = addedCount

          if (hasRemovals && !bulkDeleteInProgress) {
            logger.info('Events deleted, reloading')
            // Debounce reload to handle batch deletions
            if (reloadTimeout) {
              clearTimeout(reloadTimeout)
            }
            reloadTimeout = setTimeout(() => {
              if (active) {
                void loadEvents()
              }
            }, 500)
          } else if (hasRemovals && bulkDeleteInProgress) {
            // During bulk delete, use a longer debounce and only reload once at the end
            if (reloadTimeout) {
              clearTimeout(reloadTimeout)
            }
            reloadTimeout = setTimeout(() => {
              if (active) {
                bulkDeleteInProgress = false
                // Only log if not a historical catch-up
                if (!isHistoricalBulkDelete) {
                  logger.info('Bulk delete complete, reloading events')
                }
                void loadEvents()
              }
            }, 2000) // Longer debounce for bulk operations
          } else if (!hasRemovals && bulkDeleteInProgress) {
            // No more removals, bulk delete is complete
            bulkDeleteInProgress = false
            // Only log if not a historical catch-up
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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'useCalendarEvents.ts:286',
      message: 'Returning from useCalendarEvents',
      data: {
        loadingType: typeof loading,
        loadingValue: loading,
        hasLoading: loading !== undefined,
      },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId: 'A',
    }),
  }).catch(() => {})
  // #endregion
  return { events, instances, setEvents, loading, reload: loadEvents, syncProgress }
}
