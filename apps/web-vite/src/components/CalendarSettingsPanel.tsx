import type { CanonicalCalendar } from '@lifeos/calendar'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFirestoreCalendarListRepository } from '@/adapters/firestoreCalendarListRepository'
import { useAuth } from '@/hooks/useAuth'
import { functionUrl } from '@/lib/functionsUrl'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { DeleteAllCalendarDataSection } from './DeleteAllCalendarDataSection'
import { CleanupOrphanedDataSection } from './CleanupOrphanedDataSection'
import { useDialog } from '@/contexts/useDialog'
import { getDefaultCalendarHex } from '@/components/calendar/calendarColors'
import { useTheme } from '@/contexts/useTheme'

const calendarListRepository = createFirestoreCalendarListRepository()

type WritebackVisibility = 'default' | 'private'

export function CalendarSettingsPanel() {
  const { user } = useAuth()
  const { confirm, alert: showAlert } = useDialog()
  const { theme } = useTheme()
  const userId = user?.uid ?? ''
  const [calendars, setCalendars] = useState<CanonicalCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const defaultColor = useMemo(() => {
    void theme
    return getDefaultCalendarHex()
  }, [theme])

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
    if (!userId) return
    if (!calendarListRepository.subscribeToCalendars) return
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
      const confirmed = await confirm({
        title: 'Remove calendar',
        description: `Remove "${calendar.name}" from LifeOS? This will stop syncing its events.`,
        confirmLabel: 'Remove',
        confirmVariant: 'danger',
      })
      if (!confirmed) return
      await updateCalendar(calendarId, { syncEnabled: false, visible: false })
    },
    [calendars, updateCalendar, confirm]
  )

  const handleRestore = useCallback(
    async (calendarId: string) => {
      await updateCalendar(calendarId, { visible: true, syncEnabled: true })
    },
    [updateCalendar]
  )

  const handleConnectAccount = async () => {
    try {
      // Generate a unique account ID based on timestamp
      const accountId = `account_${Date.now()}`
      const response = await authenticatedFetch(
        functionUrl(`googleAuthStart?uid=${userId}&accountId=${accountId}`)
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Unable to start OAuth flow')
      }
      const { url } = await response.json()
      if (typeof url === 'string' && typeof window !== 'undefined') {
        window.location.assign(url)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDisconnectAccount = async (accountId: string) => {
    const accountCalendars = calendars.filter(
      (cal) => (cal.providerMeta?.accountId ?? 'primary') === accountId
    )

    const disconnectMessage = `Disconnect this Google account?\n\nThis will:\n• Delete ${accountCalendars.length} calendar${accountCalendars.length !== 1 ? 's' : ''} from LifeOS\n• Stop syncing events from this account\n\nDo you want to proceed?`

    const confirmed = await confirm({
      title: 'Disconnect account',
      description: disconnectMessage,
      confirmLabel: 'Disconnect',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    const deleteEvents = await confirm({
      title: 'Delete events from LifeOS',
      description:
        `Do you also want to delete all events from this account?\n\n` +
        `• Select "Delete events" to remove them from LifeOS (they remain in Google Calendar)\n` +
        `• Select "Keep events" to keep them in LifeOS (they become read-only)`,
      confirmLabel: 'Delete events',
      cancelLabel: 'Keep events',
      confirmVariant: 'danger',
    })

    try {
      setLoading(true)
      const url = functionUrl(
        `googleDisconnect?uid=${userId}&accountId=${accountId}&deleteEvents=${deleteEvents}`
      )
      const response = await authenticatedFetch(url)
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({}))
        throw new Error(error ?? 'Failed to disconnect')
      }
      const result = await response.json()

      // Show success message
      const message = deleteEvents
        ? `Disconnected account. Deleted ${result.calendarsDeleted} calendars and ${result.eventsDeleted} events.`
        : `Disconnected account. Deleted ${result.calendarsDeleted} calendars. Events retained.`

      await showAlert({
        title: 'Account disconnected',
        description: message,
      })

      // Reload calendars after disconnect
      await loadCalendars()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Group calendars by account
  const calendarsByAccount = useMemo(() => {
    const groups = new Map<string, CanonicalCalendar[]>()
    for (const cal of sortedCalendars) {
      const accountId = cal.providerMeta?.accountId ?? 'primary'
      if (!groups.has(accountId)) {
        groups.set(accountId, [])
      }
      groups.get(accountId)!.push(cal)
    }
    return groups
  }, [sortedCalendars])

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
          <h2>Calendar Accounts</h2>
          <p className="calendar-settings__meta">
            Connect multiple Google accounts (work, personal, family) and manage calendar sync.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="ghost-button" onClick={loadCalendars} disabled={loading}>
            Refresh
          </button>
          <button className="primary-button" onClick={handleConnectAccount}>
            + Connect Account
          </button>
        </div>
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
      ) : calendarsByAccount.size === 0 ? (
        <div className="empty-state">
          <p>No calendar accounts connected. Click "Connect Account" above to get started.</p>
        </div>
      ) : (
        <div className="calendar-settings__list">
          {Array.from(calendarsByAccount.entries()).map(([accountId, accountCalendars]) => (
            <div key={accountId} className="calendar-account-group">
              <div className="calendar-account-header">
                <div>
                  <h3>{accountId === 'primary' ? 'Primary Account' : accountId}</h3>
                  <p className="calendar-settings__meta">{accountCalendars.length} calendars</p>
                </div>
                <button
                  className="ghost-button danger"
                  onClick={() => handleDisconnectAccount(accountId)}
                >
                  Disconnect Account
                </button>
              </div>

              {accountCalendars.map((calendar) => {
                const syncEnabled = calendar.syncEnabled ?? true
                const writebackEnabled = calendar.writebackEnabled ?? true
                const writebackVisibility = (calendar.writebackVisibility ??
                  'default') as WritebackVisibility
                const lifeosColor = calendar.lifeosColor ?? calendar.color ?? defaultColor
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
                            updateCalendar(calendar.calendarId, {
                              syncEnabled: event.target.checked,
                            })
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
                              updateCalendar(calendar.calendarId, {
                                lifeosColor: event.target.value,
                              })
                            }
                          />
                          <input
                            type="text"
                            value={lifeosColor}
                            onChange={(event) =>
                              updateCalendar(calendar.calendarId, {
                                lifeosColor: event.target.value,
                              })
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
          ))}
        </div>
      )}

      <CleanupOrphanedDataSection userId={userId} />

      <DeleteAllCalendarDataSection userId={userId} />
    </section>
  )
}
