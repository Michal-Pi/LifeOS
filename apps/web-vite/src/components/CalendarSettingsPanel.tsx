import type { CanonicalCalendar } from '@lifeos/calendar'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFirestoreCalendarListRepository } from '@/adapters/firestoreCalendarListRepository'
import { useAuth } from '@/hooks/useAuth'

declare const confirm: (message: string) => boolean

const calendarListRepository = createFirestoreCalendarListRepository()

type WritebackVisibility = 'default' | 'private'

export function CalendarSettingsPanel() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const [calendars, setCalendars] = useState<CanonicalCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sortedCalendars = useMemo(() => {
    return [...calendars].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1
      if (!a.isPrimary && b.isPrimary) return 1
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [calendars])

  const loadCalendars = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const result = await calendarListRepository.listCalendars(userId)
      setCalendars(result)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void loadCalendars()
  }, [userId, loadCalendars])

  useEffect(() => {
    if (!userId || !calendarListRepository.subscribeToCalendars) return
    const unsubscribe = calendarListRepository.subscribeToCalendars(userId, (next) => {
      setCalendars(next)
    })
    return unsubscribe
  }, [userId])

  const updateCalendar = useCallback(
    async (calendarId: string, patch: Partial<CanonicalCalendar>) => {
      const existing = calendars.find((calendar) => calendar.calendarId === calendarId)
      if (!existing || !userId) return

      const updated: CanonicalCalendar = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      }

      setCalendars((prev) =>
        prev.map((calendar) => (calendar.calendarId === calendarId ? updated : calendar))
      )

      try {
        await calendarListRepository.saveCalendar(userId, updated)
        setError(null)
      } catch (err) {
        setCalendars((prev) =>
          prev.map((calendar) => (calendar.calendarId === calendarId ? existing : calendar))
        )
        setError((err as Error).message)
      }
    },
    [calendars, userId]
  )

  const handleRemove = useCallback(
    async (calendarId: string) => {
      const calendar = calendars.find((c) => c.calendarId === calendarId)
      if (!calendar) return
      const confirmed = confirm(
        `Remove "${calendar.name}" from LifeOS? This will stop syncing its events.`
      )
      if (!confirmed) return
      await updateCalendar(calendarId, { syncEnabled: false, visible: false })
    },
    [calendars, updateCalendar]
  )

  const handleRestore = useCallback(
    async (calendarId: string) => {
      await updateCalendar(calendarId, { visible: true, syncEnabled: true })
    },
    [updateCalendar]
  )

  if (!userId) {
    return (
      <section className="calendar-settings">
        <h2>Calendar Sync</h2>
        <p className="calendar-settings__meta">Sign in to manage calendar sync settings.</p>
      </section>
    )
  }

  return (
    <section className="calendar-settings">
      <header className="calendar-settings__header">
        <div>
          <h2>Calendar Sync</h2>
          <p className="calendar-settings__meta">
            Choose which calendars sync into LifeOS and how writeback behaves.
          </p>
        </div>
        <button className="ghost-button" onClick={loadCalendars} disabled={loading}>
          Refresh list
        </button>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="settings-loading">
          <p>Loading calendars...</p>
        </div>
      ) : sortedCalendars.length === 0 ? (
        <div className="empty-state">
          <p>System idle. Connect Google Calendar and run sync to load calendars.</p>
        </div>
      ) : (
        <div className="calendar-settings__list">
          {sortedCalendars.map((calendar) => {
            const syncEnabled = calendar.syncEnabled ?? true
            const writebackEnabled = calendar.writebackEnabled ?? true
            const writebackVisibility = (calendar.writebackVisibility ??
              'default') as WritebackVisibility
            const lifeosColor = calendar.lifeosColor ?? calendar.color ?? '#4f46e5'
            const canWrite = calendar.canWrite ?? false
            const isVisible = calendar.visible ?? true

            return (
              <div key={calendar.calendarId} className="calendar-settings__item">
                <div className="calendar-settings__identity">
                  <div className="calendar-settings__name">
                    <strong>{calendar.name}</strong>
                    {calendar.isPrimary && (
                      <span className="calendar-settings__badge">Primary</span>
                    )}
                  </div>
                  <p className="calendar-settings__meta">
                    {calendar.providerMeta?.provider} · {calendar.accessRole ?? 'unknown'} ·{' '}
                    {canWrite ? 'Writable' : 'Read-only'}
                  </p>
                </div>

                <div className="calendar-settings__controls">
                  <label className="calendar-settings__toggle">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={(event) =>
                        updateCalendar(calendar.calendarId, { syncEnabled: event.target.checked })
                      }
                    />
                    Sync to LifeOS
                  </label>

                  <label className="calendar-settings__toggle">
                    <input
                      type="checkbox"
                      checked={writebackEnabled}
                      disabled={!canWrite}
                      onChange={(event) =>
                        updateCalendar(calendar.calendarId, {
                          writebackEnabled: event.target.checked,
                        })
                      }
                    />
                    Writeback enabled
                  </label>

                  <label className="calendar-settings__field">
                    <span>New event visibility</span>
                    <select
                      value={writebackVisibility}
                      onChange={(event) =>
                        updateCalendar(calendar.calendarId, {
                          writebackVisibility: event.target.value as WritebackVisibility,
                        })
                      }
                    >
                      <option value="default">Use calendar default</option>
                      <option value="private">Always private</option>
                    </select>
                  </label>

                  <label className="calendar-settings__field calendar-settings__color">
                    <span>LifeOS color</span>
                    <div className="calendar-settings__color-picker">
                      <input
                        type="color"
                        value={lifeosColor}
                        onChange={(event) =>
                          updateCalendar(calendar.calendarId, { lifeosColor: event.target.value })
                        }
                      />
                      <input
                        type="text"
                        value={lifeosColor}
                        onChange={(event) =>
                          updateCalendar(calendar.calendarId, { lifeosColor: event.target.value })
                        }
                      />
                    </div>
                  </label>
                </div>

                <div className="calendar-settings__actions">
                  {isVisible ? (
                    <button
                      className="ghost-button danger"
                      onClick={() => handleRemove(calendar.calendarId)}
                    >
                      Remove from LifeOS
                    </button>
                  ) : (
                    <button
                      className="ghost-button"
                      onClick={() => handleRestore(calendar.calendarId)}
                    >
                      Add back
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
