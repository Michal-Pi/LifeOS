import { useState, useCallback, useEffect, useRef } from 'react'
import { functionUrl } from '@/lib/functionsUrl'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { openDB } from 'idb'
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'

interface DeleteOptions {
  taskHandling: 'unlink' | 'delete-linked' | 'keep-orphaned'
  compositeHandling: 'delete' | 'keep-orphaned'
  deleteHabitCheckins: boolean
  clearSyncData: boolean
}

interface PreviewCounts {
  calendars: number
  events: number
  composites: number
  tasksWithCalendarLinks: number
  habitCheckinsFromCalendar: number
}

interface DeleteCounts {
  calendarsDeleted: number
  eventsDeleted: number
  compositesDeleted: number
  tasksUpdated: number
  tasksDeleted: number
  habitCheckinsDeleted: number
  syncDataDeleted: number
}

interface ProgressCounts {
  calendars: number
  events: number
}

export function DeleteAllCalendarDataSection({ userId }: { userId: string }) {
  const [options, setOptions] = useState<DeleteOptions>({
    taskHandling: 'unlink',
    compositeHandling: 'delete',
    deleteHabitCheckins: false,
    clearSyncData: true,
  })
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewCounts, setPreviewCounts] = useState<PreviewCounts | null>(null)
  const [progressCounts, setProgressCounts] = useState<ProgressCounts | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const unsubscribeRefs = useRef<{ calendars?: Unsubscribe; events?: Unsubscribe }>({})

  const loadPreview = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await authenticatedFetch(
        functionUrl(`previewDeleteCalendarData?uid=${userId}`)
      )
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({}))
        throw new Error(error ?? 'Failed to load preview')
      }
      const counts = await response.json()
      setPreviewCounts(counts)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  const handleDeleteClick = async () => {
    await loadPreview()
    setShowConfirmDialog(true)
    setConfirmText('')
  }

  // Set up real-time progress tracking during deletion
  useEffect(() => {
    if (!isDeleting || !previewCounts) return

    const db = getFirestoreClient()
    const calendarsRef = collection(db, 'users', userId, 'calendars')
    const eventsRef = collection(db, 'users', userId, 'calendarEvents')

    // Track calendars
    const unsubscribeCalendars = onSnapshot(calendarsRef, (snapshot) => {
      const remaining = snapshot.size
      setProgressCounts((prev) => ({
        calendars: remaining,
        events: prev?.events ?? previewCounts.events,
      }))
    })

    // Track events
    const unsubscribeEvents = onSnapshot(eventsRef, (snapshot) => {
      const remaining = snapshot.size
      setProgressCounts((prev) => ({
        calendars: prev?.calendars ?? previewCounts.calendars,
        events: remaining,
      }))
    })

    unsubscribeRefs.current.calendars = unsubscribeCalendars
    unsubscribeRefs.current.events = unsubscribeEvents

    return () => {
      unsubscribeCalendars()
      unsubscribeEvents()
      unsubscribeRefs.current = {}
    }
  }, [isDeleting, previewCounts, userId])

  const handleConfirmDelete = async () => {
    if (confirmText !== 'DELETE ALL') {
      setError('Please type "DELETE ALL" to confirm')
      return
    }

    try {
      setLoading(true)
      setIsDeleting(true)
      setError(null)
      // Initialize progress counts with preview counts
      setProgressCounts({
        calendars: previewCounts?.calendars ?? 0,
        events: previewCounts?.events ?? 0,
      })

      const response = await authenticatedFetch(functionUrl('deleteAllCalendarData'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: userId, options }),
      })

      if (!response.ok) {
        const { error } = await response.json().catch(() => ({}))
        throw new Error(error ?? 'Failed to delete calendar data')
      }

      const result: { success: boolean; counts: DeleteCounts } = await response.json()

      // Wait a bit for listeners to catch up with final state
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Clear IndexedDB outbox queue
      try {
        const db = await openDB('lifeos-outbox', 2)
        const tx = db.transaction('operations', 'readwrite')
        await tx.store.clear()
        await tx.done
      } catch (dbError) {
        console.warn('Failed to clear IndexedDB outbox:', dbError)
      }

      // Clear localStorage calendar-related keys
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('calendar') || key.includes('device-id'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))

      // Show success message
      const messages: string[] = []
      messages.push(`Deleted ${result.counts.calendarsDeleted} calendars`)
      messages.push(`Deleted ${result.counts.eventsDeleted} events`)
      if (result.counts.compositesDeleted > 0) {
        messages.push(`Deleted ${result.counts.compositesDeleted} composite events`)
      }
      if (result.counts.tasksUpdated > 0) {
        messages.push(`Unlinked ${result.counts.tasksUpdated} tasks from calendar events`)
      }
      if (result.counts.tasksDeleted > 0) {
        messages.push(`Deleted ${result.counts.tasksDeleted} tasks`)
      }
      if (result.counts.habitCheckinsDeleted > 0) {
        messages.push(`Deleted ${result.counts.habitCheckinsDeleted} habit check-ins`)
      }
      if (result.counts.syncDataDeleted > 0) {
        messages.push(`Cleared ${result.counts.syncDataDeleted} sync data items`)
      }

      alert(`Calendar data deleted successfully!\n\n${messages.join('\n')}`)

      setShowConfirmDialog(false)
      setConfirmText('')
      setPreviewCounts(null)
      setProgressCounts(null)
      setIsDeleting(false)

      // Clean up listeners
      if (unsubscribeRefs.current.calendars) {
        unsubscribeRefs.current.calendars()
      }
      if (unsubscribeRefs.current.events) {
        unsubscribeRefs.current.events()
      }
      unsubscribeRefs.current = {}

      // Reload the page to refresh the UI
      window.location.reload()
    } catch (err) {
      setError((err as Error).message)
      setIsDeleting(false)
      setProgressCounts(null)
      // Clean up listeners on error
      if (unsubscribeRefs.current.calendars) {
        unsubscribeRefs.current.calendars()
      }
      if (unsubscribeRefs.current.events) {
        unsubscribeRefs.current.events()
      }
      unsubscribeRefs.current = {}
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <section className="calendar-settings danger-zone">
        <header className="calendar-settings__header">
          <div>
            <h2>Danger Zone</h2>
            <p className="calendar-settings__meta">
              Permanently delete all calendar data. This action cannot be undone.
            </p>
          </div>
        </header>

        <div className="calendar-settings__delete-options">
          <div className="calendar-settings__field">
            <label htmlFor="taskHandling">What should happen to linked tasks?</label>
            <select
              id="taskHandling"
              value={options.taskHandling}
              onChange={(e) =>
                setOptions({
                  ...options,
                  taskHandling: e.target.value as 'unlink' | 'delete-linked' | 'keep-orphaned',
                })
              }
            >
              <option value="unlink">Remove calendar links from tasks (keep tasks)</option>
              <option value="delete-linked">Delete only tasks with calendar links</option>
              <option value="keep-orphaned">Keep calendar links (may become orphaned)</option>
            </select>
            <p className="calendar-settings__help">
              {options.taskHandling === 'unlink' &&
                'Recommended: Tasks will remain but calendar event associations will be removed. Good for calendar migration.'}
              {options.taskHandling === 'delete-linked' &&
                'Tasks that are scheduled on calendar events will be permanently deleted.'}
              {options.taskHandling === 'keep-orphaned' &&
                'Advanced: Tasks will keep references to deleted events. Only use if re-importing events.'}
            </p>
          </div>

          <div className="calendar-settings__field">
            <label htmlFor="compositeHandling">What should happen to composite events?</label>
            <select
              id="compositeHandling"
              value={options.compositeHandling}
              onChange={(e) =>
                setOptions({
                  ...options,
                  compositeHandling: e.target.value as 'delete' | 'keep-orphaned',
                })
              }
            >
              <option value="delete">Delete all composites</option>
              <option value="keep-orphaned">Keep composites (not recommended)</option>
            </select>
            <p className="calendar-settings__help">
              {options.compositeHandling === 'delete' &&
                'Recommended: Composite events are calendar-specific and should be deleted.'}
              {options.compositeHandling === 'keep-orphaned' &&
                'Advanced: Only use if re-importing events and want to preserve deduplication.'}
            </p>
          </div>

          <label className="calendar-settings__toggle">
            <input
              type="checkbox"
              checked={options.deleteHabitCheckins}
              onChange={(e) =>
                setOptions({ ...options, deleteHabitCheckins: e.target.checked })
              }
            />
            Delete habit check-ins from calendar events
          </label>

          <label className="calendar-settings__toggle">
            <input
              type="checkbox"
              checked={options.clearSyncData}
              onChange={(e) => setOptions({ ...options, clearSyncData: e.target.checked })}
            />
            Clear all sync history and cache
          </label>
        </div>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <button
          className="danger-button"
          onClick={handleDeleteClick}
          disabled={loading}
        >
          Delete All Calendar Data
        </button>
      </section>

      {showConfirmDialog && (
        <div
          className="modal-overlay"
          onClick={() => !isDeleting && setShowConfirmDialog(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>
                {isDeleting ? 'Deleting Calendar Data' : 'Confirm: Delete All Calendar Data'}
              </h2>
              {!isDeleting && (
                <button className="modal-close" onClick={() => setShowConfirmDialog(false)}>
                  ✕
                </button>
              )}
            </header>

            <div className="modal-body">
              {isDeleting && previewCounts && progressCounts ? (
                <>
                  <p className="modal-warning">Deleting calendar data...</p>

                  <div className="delete-progress">
                    <div className="progress-item">
                      <div className="progress-header">
                        <span>Calendars</span>
                        <span className="progress-count">
                          {previewCounts.calendars - progressCounts.calendars} /{' '}
                          {previewCounts.calendars}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${
                              previewCounts.calendars > 0
                                ? ((previewCounts.calendars - progressCounts.calendars) /
                                    previewCounts.calendars) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="progress-item">
                      <div className="progress-header">
                        <span>Events</span>
                        <span className="progress-count">
                          {previewCounts.events - progressCounts.events} / {previewCounts.events}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${
                              previewCounts.events > 0
                                ? ((previewCounts.events - progressCounts.events) /
                                    previewCounts.events) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="modal-warning">
                    You are about to permanently delete:
                  </p>

                  {previewCounts && (
                    <ul className="modal-list">
                      <li>{previewCounts.calendars} calendars</li>
                      <li>{previewCounts.events} calendar events</li>
                      {previewCounts.composites > 0 && (
                        <li>{previewCounts.composites} composite events (deduplicated events)</li>
                      )}
                    </ul>
                  )}

                  <p className="modal-warning">Affected linked data:</p>

                  {previewCounts && (
                    <ul className="modal-list">
                      {previewCounts.tasksWithCalendarLinks > 0 && (
                        <li>
                          {previewCounts.tasksWithCalendarLinks} tasks{' '}
                          {options.taskHandling === 'unlink' && 'will have calendar links removed'}
                          {options.taskHandling === 'delete-linked' && 'will be deleted'}
                          {options.taskHandling === 'keep-orphaned' && 'will remain unchanged'}
                        </li>
                      )}
                      {previewCounts.habitCheckinsFromCalendar > 0 && (
                        <li>
                          {previewCounts.habitCheckinsFromCalendar} habit check-ins{' '}
                          {options.deleteHabitCheckins
                            ? 'will be deleted'
                            : 'will remain unchanged'}
                        </li>
                      )}
                    </ul>
                  )}

                  <p className="modal-warning">
                    This action <strong>cannot be undone</strong>.
                  </p>

                  <div className="modal-field">
                    <label htmlFor="confirmText">
                      Type <strong>DELETE ALL</strong> to confirm:
                    </label>
                    <input
                      id="confirmText"
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE ALL"
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                </>
              )}
            </div>

            <footer className="modal-footer">
              {!isDeleting && (
                <>
                  <button
                    className="ghost-button"
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    className="danger-button"
                    onClick={handleConfirmDelete}
                    disabled={loading || confirmText !== 'DELETE ALL'}
                  >
                    {loading ? 'Deleting...' : 'Delete All Calendar Data'}
                  </button>
                </>
              )}
              {isDeleting && (
                <div className="deleting-status">
                  <span>Deletion in progress... Please wait.</span>
                </div>
              )}
            </footer>
          </div>
        </div>
      )}

      <style>{`
        .delete-progress {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          margin: 1.5rem 0;
        }

        .progress-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.9rem;
        }

        .progress-header span:first-child {
          font-weight: 500;
          color: var(--foreground);
        }

        .progress-count {
          font-size: 0.85rem;
          color: var(--muted-foreground);
          font-family: var(--font-mono);
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: var(--muted);
          border-radius: 999px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 999px;
          transition: width 0.3s ease;
        }

        .deleting-status {
          text-align: center;
          padding: 0.75rem;
          color: var(--muted-foreground);
          font-size: 0.9rem;
        }
      `}</style>
    </>
  )
}
