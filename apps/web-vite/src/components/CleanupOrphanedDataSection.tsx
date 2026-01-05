import { useState, useCallback } from 'react'
import { createFirestoreTodoRepository } from '@/adapters/firestoreTodoRepository'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { createFirestoreCompositeRepository } from '@/adapters/firestoreCompositeRepository'

interface OrphanedData {
  tasksWithOrphanedLinks: Array<{ id: string; title: string; orphanedEventIds: string[] }>
  compositesWithOrphanedMembers: Array<{ id: string; orphanedMemberIds: string[] }>
}

export function CleanupOrphanedDataSection({ userId }: { userId: string }) {
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [orphanedData, setOrphanedData] = useState<OrphanedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cleanupOptions, setCleanupOptions] = useState({
    cleanTasks: true,
    cleanComposites: true,
  })

  const todoRepository = createFirestoreTodoRepository()
  const calendarRepository = createFirestoreCalendarEventRepository()
  const compositeRepository = createFirestoreCompositeRepository()

  const scanForOrphans = useCallback(async () => {
    try {
      setScanning(true)
      setError(null)

      // Get all calendar events - use a large date range to get all events
      const farPast = Date.now() - 365 * 24 * 60 * 60 * 1000 * 10 // 10 years ago
      const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000 * 10 // 10 years from now
      const allEvents = await calendarRepository.listByRange(userId, farPast, farFuture)
      const eventIds = new Set(allEvents.map((e) => e.canonicalEventId))

      // Get all tasks and check for orphaned calendar links
      const allTasks = await todoRepository.getTasks(userId)
      const tasksWithOrphanedLinks = allTasks
        .filter((task) => {
          const calendarEventIds = task.calendarEventIds ?? []
          return calendarEventIds.some((eventId) => !eventIds.has(eventId))
        })
        .map((task) => ({
          id: task.id,
          title: task.title,
          orphanedEventIds: (task.calendarEventIds ?? []).filter(
            (eventId) => !eventIds.has(eventId)
          ),
        }))

      // Get all composites and check for orphaned members - use same large date range
      const allComposites = await compositeRepository.listByRange(userId, farPast, farFuture)
      const compositesWithOrphanedMembers = allComposites
        .filter((composite) => {
          const memberIds = composite.members?.map((m) => m.canonicalEventId) ?? []
          return memberIds.some((memberId) => !eventIds.has(memberId))
        })
        .map((composite) => ({
          id: composite.id ?? composite.compositeEventId ?? 'unknown',
          orphanedMemberIds: (composite.members?.map((m) => m.canonicalEventId) ?? []).filter(
            (memberId) => !eventIds.has(memberId)
          ),
        }))

      setOrphanedData({
        tasksWithOrphanedLinks,
        compositesWithOrphanedMembers,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setScanning(false)
    }
  }, [userId, todoRepository, calendarRepository, compositeRepository])

  const cleanupOrphans = useCallback(async () => {
    if (!orphanedData) return

    try {
      setCleaning(true)
      setError(null)

      let tasksCleaned = 0
      let compositesCleaned = 0

      // Get all calendar events - use a large date range to get all events
      const farPast = Date.now() - 365 * 24 * 60 * 60 * 1000 * 10 // 10 years ago
      const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000 * 10 // 10 years from now
      const allEvents = await calendarRepository.listByRange(userId, farPast, farFuture)
      const eventIds = new Set(allEvents.map((e) => e.canonicalEventId))

      // Clean up tasks
      if (cleanupOptions.cleanTasks) {
        const allTasks = await todoRepository.getTasks(userId)

        for (const task of allTasks) {
          const calendarEventIds = task.calendarEventIds ?? []
          const validEventIds = calendarEventIds.filter((eventId) => eventIds.has(eventId))

          if (validEventIds.length !== calendarEventIds.length) {
            await todoRepository.saveTask({
              ...task,
              calendarEventIds: validEventIds,
              updatedAt: new Date().toISOString(),
            })
            tasksCleaned++
          }
        }
      }

      // Clean up composites
      if (cleanupOptions.cleanComposites) {
        const allComposites = await compositeRepository.listByRange(userId, farPast, farFuture)

        for (const composite of allComposites) {
          const members = composite.members ?? []
          const validMembers = members.filter((m) => eventIds.has(m.canonicalEventId))

          // If composite would have < 2 members after cleanup, delete it
          if (validMembers.length < 2 && members.length !== validMembers.length) {
            await compositeRepository.delete(
              userId,
              composite.id ?? composite.compositeEventId ?? ''
            )
            compositesCleaned++
          }
        }
      }

      alert(
        `Cleanup complete!\n\n` +
          `Tasks cleaned: ${tasksCleaned}\n` +
          `Composites cleaned: ${compositesCleaned}`
      )

      // Rescan to show updated state
      await scanForOrphans()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCleaning(false)
    }
  }, [
    orphanedData,
    cleanupOptions,
    userId,
    todoRepository,
    calendarRepository,
    compositeRepository,
    scanForOrphans,
  ])

  return (
    <section className="calendar-settings cleanup-section">
      <header className="calendar-settings__header">
        <div>
          <h2>Data Cleanup</h2>
          <p className="calendar-settings__meta">
            Find and fix orphaned references to deleted calendar events.
          </p>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {!orphanedData ? (
        <div>
          <p className="calendar-settings__meta">
            Scan your data to find tasks and composite events that reference deleted calendar
            events.
          </p>
          <button className="primary-button" onClick={scanForOrphans} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan for Orphaned Data'}
          </button>
        </div>
      ) : (
        <div>
          <div className="cleanup-results">
            <h3>Scan Results</h3>
            {orphanedData.tasksWithOrphanedLinks.length === 0 &&
            orphanedData.compositesWithOrphanedMembers.length === 0 ? (
              <p className="calendar-settings__meta">
                No orphaned references found. Your data is clean!
              </p>
            ) : (
              <>
                {orphanedData.tasksWithOrphanedLinks.length > 0 && (
                  <div className="cleanup-issue">
                    <p>
                      <strong>{orphanedData.tasksWithOrphanedLinks.length} tasks</strong> reference
                      deleted calendar events
                    </p>
                    <ul className="cleanup-list">
                      {orphanedData.tasksWithOrphanedLinks.slice(0, 5).map((task) => (
                        <li key={task.id}>
                          {task.title} ({task.orphanedEventIds.length} orphaned{' '}
                          {task.orphanedEventIds.length === 1 ? 'link' : 'links'})
                        </li>
                      ))}
                      {orphanedData.tasksWithOrphanedLinks.length > 5 && (
                        <li>...and {orphanedData.tasksWithOrphanedLinks.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {orphanedData.compositesWithOrphanedMembers.length > 0 && (
                  <div className="cleanup-issue">
                    <p>
                      <strong>
                        {orphanedData.compositesWithOrphanedMembers.length} composites
                      </strong>{' '}
                      have invalid event members
                    </p>
                  </div>
                )}

                <div className="cleanup-options">
                  <label className="calendar-settings__toggle">
                    <input
                      type="checkbox"
                      checked={cleanupOptions.cleanTasks}
                      onChange={(e) =>
                        setCleanupOptions({ ...cleanupOptions, cleanTasks: e.target.checked })
                      }
                    />
                    Remove invalid calendar links from tasks
                  </label>

                  <label className="calendar-settings__toggle">
                    <input
                      type="checkbox"
                      checked={cleanupOptions.cleanComposites}
                      onChange={(e) =>
                        setCleanupOptions({ ...cleanupOptions, cleanComposites: e.target.checked })
                      }
                    />
                    Clean up broken composite events
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="ghost-button"
                    onClick={() => setOrphanedData(null)}
                    disabled={cleaning}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    onClick={cleanupOrphans}
                    disabled={
                      cleaning || (!cleanupOptions.cleanTasks && !cleanupOptions.cleanComposites)
                    }
                  >
                    {cleaning ? 'Cleaning...' : 'Clean Up Orphaned Data'}
                  </button>
                </div>
              </>
            )}
          </div>

          <button className="ghost-button" onClick={scanForOrphans} disabled={scanning || cleaning}>
            {scanning ? 'Scanning...' : 'Rescan'}
          </button>
        </div>
      )}
    </section>
  )
}
