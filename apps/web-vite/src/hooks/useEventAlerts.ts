/**
 * useEventAlerts Hook
 *
 * Manages calendar event alerts including:
 * - Alert scheduling and notifications
 * - Alert dismissal tracking
 * - Alert configuration changes
 * - Active alerts display
 *
 * This hook encapsulates all alert-related logic for calendar events.
 */

import { useState, useEffect, useCallback } from 'react'
import type { CanonicalCalendarEvent, CanonicalAlert } from '@lifeos/calendar'
import { createAlertDismissal } from '@lifeos/calendar'
import { createLogger } from '@lifeos/core'
import { startAlertScheduler, stopAlertScheduler, updateSchedulerEvents, type PendingAlert } from '@/alerts/alertScheduler'
import { enqueueUpdate } from '@/outbox/worker'

const logger = createLogger('useEventAlerts')

interface UseEventAlertsParams {
  userId: string
  events: CanonicalCalendarEvent[]
  setEvents: React.Dispatch<React.SetStateAction<CanonicalCalendarEvent[]>>
  selectedEvent: CanonicalCalendarEvent | null
  setSelectedEvent: (event: CanonicalCalendarEvent | null) => void
}

interface UseEventAlertsReturn {
  activeAlerts: PendingAlert[]
  handleAlertDismiss: (event: CanonicalCalendarEvent) => Promise<void>
  handleAlertOpenEvent: (event: CanonicalCalendarEvent) => void
  handleAlertChange: (alert: CanonicalAlert | null) => Promise<void>
}

export function useEventAlerts({
  userId,
  events,
  setEvents,
  selectedEvent,
  setSelectedEvent
}: UseEventAlertsParams): UseEventAlertsReturn {
  // Alert state
  const [activeAlerts, setActiveAlerts] = useState<PendingAlert[]>([])

  // Alert scheduler (Phase 2.5)
  useEffect(() => {
    const handleAlert = (pendingAlert: PendingAlert) => {
      // Add to active alerts (avoiding duplicates)
      setActiveAlerts((prev) => {
        if (prev.some((a) => a.event.canonicalEventId === pendingAlert.event.canonicalEventId)) {
          return prev
        }
        return [...prev, pendingAlert]
      })
    }

    startAlertScheduler(handleAlert)

    return () => {
      stopAlertScheduler()
    }
  }, [])

  // Update alert scheduler when events change
  useEffect(() => {
    updateSchedulerEvents(events)
  }, [events])

  // Handle alert dismissal
  const handleAlertDismiss = useCallback(async (event: CanonicalCalendarEvent) => {
    // Remove from active alerts
    setActiveAlerts((prev) => prev.filter((a) => a.event.canonicalEventId !== event.canonicalEventId))

    // Create dismissal state
    const dismissal = createAlertDismissal(event)

    // Update canonical event with dismissal
    const updatedEvent: CanonicalCalendarEvent = {
      ...event,
      alertDismissal: dismissal,
      canonicalUpdatedAtMs: Date.now(),
      source: { type: 'local' as const }
    }

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) => (e.canonicalEventId === event.canonicalEventId ? updatedEvent : e))
    )

    // Persist via outbox
    try {
      await enqueueUpdate(userId, updatedEvent, event.updatedAtMs)
    } catch (error) {
      logger.error('Failed to persist alert dismissal', error)
    }
  }, [userId, setEvents])

  // Handle opening event from alert banner
  const handleAlertOpenEvent = useCallback((event: CanonicalCalendarEvent) => {
    setSelectedEvent(event)
    // Dismiss the alert when opening
    void handleAlertDismiss(event)
  }, [handleAlertDismiss, setSelectedEvent])

  // Handle alert setting change
  const handleAlertChange = useCallback(async (alert: CanonicalAlert | null) => {
    if (!selectedEvent) return

    const updatedEvent: CanonicalCalendarEvent = {
      ...selectedEvent,
      alerts: alert ? [alert] : [],
      alertsUpdatedAtMs: Date.now(),
      canonicalUpdatedAtMs: Date.now(),
      source: { type: 'local' as const }
    }

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) => (e.canonicalEventId === selectedEvent.canonicalEventId ? updatedEvent : e))
    )
    setSelectedEvent(updatedEvent)

    // Persist via outbox
    try {
      await enqueueUpdate(userId, updatedEvent, selectedEvent.updatedAtMs)
    } catch (error) {
      logger.error('Failed to persist alert change', error)
      // Revert on error
      setEvents((prev) =>
        prev.map((e) => (e.canonicalEventId === selectedEvent.canonicalEventId ? selectedEvent : e))
      )
      setSelectedEvent(selectedEvent)
    }
  }, [selectedEvent, userId, setEvents, setSelectedEvent])

  return {
    activeAlerts,
    handleAlertDismiss,
    handleAlertOpenEvent,
    handleAlertChange
  }
}
