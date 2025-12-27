/**
 * Calendar Page - The Main Calendar Interface
 *
 * This is the primary calendar user interface for LifeOS, providing a comprehensive
 * event management experience with offline-first capabilities and Google Calendar sync.
 *
 * Key Features:
 * - Full calendar event CRUD operations (Create, Read, Update, Delete)
 * - Recurring event support with complex patterns and exceptions
 * - RSVP functionality for meeting attendees
 * - Alert notifications with dismissal tracking
 * - Google Calendar bidirectional sync with conflict resolution
 * - Offline mode with outbox queuing
 * - Permission-aware UI based on calendar access roles
 * - Real-time sync status and error handling
 * - Month view calendar grid with event indicators
 * - Event timeline with detailed event cards
 * - Comprehensive event details panel
 *
 * Architecture:
 * - React functional component with hooks for state management
 * - Repository pattern for data access (Firestore adapters)
 * - Outbox pattern for offline operations and sync
 * - Alert scheduler for event notifications
 * - Optimistic updates for responsive UI
 * - Conflict resolution for multi-device sync
 * - Permission checks for secure operations
 *
 * State Management:
 * - Events: Current day's events with real-time updates
 * - Selected event: Currently viewed event details
 * - Sync status: Online/offline, pending operations, failed ops
 * - Modals: Event form, delete confirmation, scope selection
 * - Alerts: Active notifications with dismissal state
 * - Permissions: Calendar access roles and event-level permissions
 *
 * Integration Points:
 * - Google Calendar API via Firebase Functions
 * - Firestore for data persistence
 * - IndexedDB for offline outbox storage
 * - Browser notifications for alerts
 * - Real-time subscriptions for calendar updates
 */

import type {
  CalendarAccountStatus,
  CanonicalCalendarEvent,
  CanonicalCalendar,
  CalendarsById,
} from '@lifeos/calendar'
import {} from '@lifeos/calendar'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('CalendarPage')

import { createFirestoreCalendarListRepository } from '@/adapters/firestoreCalendarListRepository'
import { createFirestoreSyncStatusRepository } from '@/adapters/firestoreSyncStatusRepository'
import { AlertBannerContainer } from '@/components/AlertBanner'
import { CalendarSidebar } from '@/components/CalendarSidebar'
import { CalendarHeader } from '@/components/calendar/CalendarHeader'
import { SyncStatusBanner } from '@/components/calendar/SyncStatusBanner'
import {
  EventModalsContainer,
  type EventModalsContainerHandle,
} from '@/components/calendar/EventModalsContainer'
import { CalendarViewsContainer } from '@/components/calendar/CalendarViewsContainer'
import { minutesAgo } from '@/utils/timeFormatters'
import { useAuth } from '@/hooks/useAuth'
import { useEventOperations } from '@/hooks/useEventOperations'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { useOutbox } from '@/hooks/useOutbox'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useEventAlerts } from '@/hooks/useEventAlerts'
import { fetchCalendarAccountStatus } from '@/lib/accountStatus'
import { functionUrl } from '@/lib/functionsUrl'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

const calendarListRepository = createFirestoreCalendarListRepository()
const syncRepository = createFirestoreSyncStatusRepository()

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
})

const ACCOUNT_ID = 'primary'

export function CalendarPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const [selectedEvent, setSelectedEvent] = useState<CanonicalCalendarEvent | null>(null)
  const [status, setStatus] = useState<{
    lastSyncAt?: string
    lastSuccessAt?: string
    lastError?: string
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [accountStatus, setAccountStatus] = useState<CalendarAccountStatus | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Calendar permissions (Phase 2.6)
  const [calendars, setCalendars] = useState<CanonicalCalendar[]>([])
  const calendarsById = useMemo<CalendarsById>(() => {
    const map = new Map<string, CanonicalCalendar>()
    for (const cal of calendars) {
      map.set(cal.calendarId, cal)
      // Also index by provider calendar ID for backwards compatibility
      if (cal.providerMeta?.providerCalendarId) {
        map.set(cal.providerMeta.providerCalendarId, cal)
      }
    }
    return map
  }, [calendars])

  // Outbox / offline state via hook
  const { pendingOps, failedOps, isOnline, retryAll: handleRetryAll } = useOutbox(userId)
  useAutoSync(userId, ACCOUNT_ID)

  // Modal management via ref
  const modalsRef = useRef<EventModalsContainerHandle>(null)

  const todayKey = useMemo(() => new Date().toISOString().split('T')[0], [])
  const today = useMemo(() => new Date(), [])
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // View state
  const [viewType, setViewType] = useState<'daily' | 'weekly' | 'monthly' | 'agenda'>('monthly')
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date | null>(null)
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  // Calculate selected day key for event filtering
  const selectedDayKey = useMemo(() => {
    return selectedMonthDate?.toISOString().split('T')[0] || todayKey
  }, [selectedMonthDate, todayKey])

  // Use selected day for event loading
  const displayDayKeys = useMemo(() => {
    const keys: string[] = []
    if (viewType === 'agenda') {
      const start = selectedMonthDate || today
      for (let i = 0; i < 14; i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        keys.push(d.toISOString().split('T')[0])
      }
      return keys
    }

    if (viewType === 'monthly') {
      const start = new Date(currentYear, currentMonth, 1)
      const end = new Date(currentYear, currentMonth + 1, 0)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        keys.push(d.toISOString().split('T')[0])
      }
      return keys
    }

    if (viewType === 'weekly') {
      const weekStart = new Date(selectedMonthDate || today)
      const dayOfWeek = weekStart.getDay()
      weekStart.setDate(weekStart.getDate() - dayOfWeek)
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        keys.push(d.toISOString().split('T')[0])
      }
      return keys
    }

    return [selectedDayKey]
  }, [selectedDayKey, viewType, selectedMonthDate, today, currentYear, currentMonth])

  // Load events via hook
  const {
    events,
    instances,
    setEvents,
    loading,
    reload: reloadEvents,
  } = useCalendarEvents(userId, displayDayKeys)

  // Event operations hook
  const { createEvent, updateEvent, deleteEvent, retryWriteback, rsvpEvent } = useEventOperations({
    userId,
    setEvents,
    selectedEvent,
    setSelectedEvent,
    setFormModalOpen: () => {},
    setDeleteModalOpen: () => {},
    setEditScope: () => {},
    setPendingFormData: () => {},
    setPendingOps: () => {}, // Handled by useOutbox listener mostly, but hook might trigger refresh
    setConnectionError,
  })

  // Event alerts hook
  const { activeAlerts, handleAlertDismiss, handleAlertOpenEvent, handleAlertChange } =
    useEventAlerts({
      userId,
      events,
      setEvents,
      selectedEvent,
      setSelectedEvent,
    })

  // Load sync status
  useEffect(() => {
    let active = true
    const loadStatus = async () => {
      const remoteStatus = await syncRepository.getStatus(userId)
      if (active) {
        setStatus(remoteStatus)
      }
    }
    void loadStatus()
    return () => {
      active = false
    }
  }, [userId])

  // Load account status
  useEffect(() => {
    let active = true
    const loadAccountStatus = async () => {
      const result = await fetchCalendarAccountStatus(userId, ACCOUNT_ID)
      if (active) {
        setAccountStatus(result)
      }
    }
    void loadAccountStatus()
    return () => {
      active = false
    }
  }, [userId])

  // Subscribe to calendars (Phase 2.6 - real-time permission updates)
  useEffect(() => {
    // Initial load
    const loadCalendars = async () => {
      try {
        const cals = await calendarListRepository.listCalendars(userId)
        setCalendars(cals)
      } catch (error) {
        logger.error('Failed to load calendars:', error)
      }
    }
    void loadCalendars()

    // Subscribe to real-time updates if available
    if (calendarListRepository.subscribeToCalendars) {
      const unsubscribe = calendarListRepository.subscribeToCalendars(userId, (cals) => {
        setCalendars(cals)
      })
      return unsubscribe
    }
  }, [userId])

  // Auto-select first event
  useEffect(() => {
    if (!selectedEvent && events.length) {
      setSelectedEvent(events[0])
    }
  }, [events, selectedEvent])

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const response = await authenticatedFetch(
        functionUrl('syncNow?uid=' + userId + '&accountId=' + ACCOUNT_ID)
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Sync failed')
      }
      // Reload events after sync
      await reloadEvents()
    } catch (error) {
      setConnectionError((error as Error).message)
    } finally {
      const remoteStatus = await syncRepository.getStatus(userId)
      setStatus(remoteStatus)
      setSyncing(false)
    }
  }

  const handleConnectGoogle = async () => {
    setConnectionError(null)
    try {
      const response = await authenticatedFetch(
        functionUrl('googleAuthStart?uid=' + userId + '&accountId=' + ACCOUNT_ID)
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Unable to start OAuth flow')
      }
      const { url } = await response.json()
      if (typeof url === 'string') {
        if (typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
          window.location.assign(url)
        }
      } else {
        throw new Error('Invalid redirect URL')
      }
    } catch (error) {
      setConnectionError((error as Error).message)
    }
  }

  const handleDisconnectGoogle = async () => {
    setConnectionError(null)
    try {
      const response = await authenticatedFetch(
        functionUrl('googleDisconnect?uid=' + userId + '&accountId=' + ACCOUNT_ID)
      )
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({}))
        throw new Error(error ?? 'Failed to disconnect')
      }
      setAccountStatus((prev) => ({ ...(prev ?? {}), status: 'disconnected' }))
    } catch (error) {
      setConnectionError((error as Error).message)
    }
  }

  // Modal handlers via ref
  const openCreateModal = useCallback(() => {
    modalsRef.current?.openCreateModal()
  }, [])

  const openEditModal = useCallback(() => {
    modalsRef.current?.openEditModal()
  }, [])

  const openDeleteModal = useCallback(() => {
    modalsRef.current?.openDeleteModal()
  }, [])

  // Permission checks (Phase 2.6)
  const primaryCalendar = calendars.find((c) => c.isPrimary)
  const canCreateEvents = primaryCalendar?.canWrite ?? true // Optimistic if no calendar data yet

  // Stats
  const meetingHours = events
    .filter((event) => (event.attendees?.length ?? 0) > 0)
    .reduce((sum, event) => sum + (event.endMs - event.startMs) / 3_600_000, 0)
  const busyHours = events.reduce(
    (sum, event) => sum + (event.endMs - event.startMs) / 3_600_000,
    0
  )
  const freeHours = Math.max(24 - busyHours, 0)

  return (
    <>
      {/* Alert Banner (Phase 2.5) */}
      <AlertBannerContainer
        alerts={activeAlerts}
        onDismiss={handleAlertDismiss}
        onOpenEvent={handleAlertOpenEvent}
      />

      <section className="calendar-page">
        <header className="calendar-header">
          <div>
            <p className="section-label">
              Calendar ·{' '}
              {selectedMonthDate
                ? dayFormatter.format(selectedMonthDate)
                : dayFormatter.format(today)}
            </p>
            <CalendarHeader
              viewType={viewType}
              onViewTypeChange={setViewType}
              selectedMonthDate={selectedMonthDate}
              timezone={timezone}
            />
          </div>
          <SyncStatusBanner
            isOnline={isOnline}
            accountStatus={accountStatus}
            connectionError={connectionError}
            syncing={syncing}
            status={status}
            pendingOps={pendingOps}
            failedOps={failedOps}
            selectedMonthDate={selectedMonthDate}
            canCreateEvents={canCreateEvents}
            onRetryAll={handleRetryAll}
            onBackToToday={() => setSelectedMonthDate(null)}
            onCreateEvent={openCreateModal}
            onSyncNow={handleSyncNow}
            onConnectGoogle={handleConnectGoogle}
            onDisconnectGoogle={handleDisconnectGoogle}
          />
        </header>

        <section className="calendar-stats">
          <div>
            <p className="section-label">Meetings</p>
            <strong>{meetingHours.toFixed(1)}h</strong>
            <p>hours with guests</p>
          </div>
          <div>
            <p className="section-label">Free time</p>
            <strong>{freeHours.toFixed(1)}h</strong>
            <p>available today</p>
          </div>
          <div>
            <p className="section-label">Sync status</p>
            <strong>{status ? minutesAgo(status.lastSyncAt) : 'pending'}</strong>
            <p className="calendar-meta">
              Updated{' '}
              {status?.lastSyncAt ? timeFormatter.format(new Date(status.lastSyncAt)) : 'soon'}
            </p>
          </div>
        </section>

        {/* Calendar Views and Event Timeline */}
        <CalendarViewsContainer
          viewType={viewType}
          currentYear={currentYear}
          currentMonth={currentMonth}
          selectedMonthDate={selectedMonthDate}
          today={today}
          events={events}
          instances={instances}
          loading={loading}
          selectedEvent={selectedEvent}
          pendingOps={pendingOps}
          onDateSelect={setSelectedMonthDate}
          onEventSelect={setSelectedEvent}
        />

        <section className="calendar-grid">
          <CalendarSidebar
            selectedEvent={selectedEvent}
            isOnline={isOnline}
            accountStatus={accountStatus}
            calendarsById={calendarsById}
            onRSVP={(eventId, status) => rsvpEvent(eventId, status, events)}
            onAlertChange={handleAlertChange}
            onRetryWriteback={retryWriteback}
            onConnectGoogle={handleConnectGoogle}
            onEdit={openEditModal}
            onDelete={openDeleteModal}
          />
        </section>

        {/* Event Modals */}
        <EventModalsContainer
          ref={modalsRef}
          selectedEvent={selectedEvent}
          onCreateEvent={createEvent}
          onUpdateEvent={updateEvent}
          onDeleteEvent={deleteEvent}
        />
      </section>
    </>
  )
}
