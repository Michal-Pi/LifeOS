/**
 * useEventService - Business Logic Layer
 *
 * Provides event CRUD operations without UI state dependencies.
 * Use this hook when you need event operations but don't need UI state management.
 *
 * Example usage in TodoPage:
 *   const eventService = useEventService(userId)
 *   const newEvent = await eventService.createEvent(formData, { taskId: task.id })
 */

import { useCallback } from 'react'
import type {
  CanonicalCalendarEvent,
  CanonicalRecurrence,
  CanonicalRecurrenceRule,
  Weekday
} from '@lifeos/calendar'
import { computeOccursOn } from '@lifeos/calendar'
import type { EventFormData } from '@/components/EventFormModal'
import { generateId } from '@/lib/idGenerator'
import { enqueueCreate } from '@/outbox/worker'

interface UseEventServiceProps {
  userId: string
}

/**
 * Build canonical recurrence from form data
 */
function buildRecurrenceV2(formData: EventFormData): CanonicalRecurrence | undefined {
  if (!formData.recurrence || formData.recurrence.frequency === 'none') {
    return undefined
  }

  const { recurrence } = formData
  const rule: CanonicalRecurrenceRule = {
    freq: recurrence.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  }

  if (recurrence.interval && recurrence.interval > 1) rule.interval = recurrence.interval
  if (recurrence.frequency === 'WEEKLY' && recurrence.weekdays?.length) {
    rule.byWeekday = recurrence.weekdays as Weekday[]
  }
  if (recurrence.frequency === 'MONTHLY' && recurrence.monthDay) {
    rule.byMonthDay = [recurrence.monthDay]
  }

  if (recurrence.endType === 'count' && recurrence.count) {
    rule.count = recurrence.count
  } else if (recurrence.endType === 'until' && recurrence.untilDate) {
    const untilDate = new Date(`${recurrence.untilDate}T23:59:59`)
    rule.untilMs = untilDate.getTime()
  }

  return { tz: formData.timezone, rule }
}

export function useEventService({ userId }: UseEventServiceProps) {
  /**
   * Create a new calendar event
   * @param data Event form data
   * @param metadata Optional metadata (e.g., taskId for task integration)
   * @returns The created event
   */
  const createEvent = useCallback(
    async (data: EventFormData, metadata?: Record<string, unknown>): Promise<CanonicalCalendarEvent> => {
      const startMs = data.allDay
        ? new Date(`${data.startDate}T00:00:00`).getTime()
        : new Date(`${data.startDate}T${data.startTime}`).getTime()
      const endMs = data.allDay
        ? new Date(`${data.endDate}T23:59:59`).getTime()
        : new Date(`${data.endDate}T${data.endTime}`).getTime()

      const nowMs = Date.now()
      const recurrenceV2 = buildRecurrenceV2(data)
      const isRecurring = Boolean(recurrenceV2)

      const newEvent: CanonicalCalendarEvent = {
        canonicalEventId: `local:${generateId()}`,
        schemaVersion: 1,
        normalizationVersion: 1,
        providerRef: {
          provider: 'local',
          accountId: 'local',
          providerCalendarId: 'local',
          providerEventId: `local:${generateId()}`
        },
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        canonicalUpdatedAtMs: nowMs,
        syncState: 'pending_writeback',
        source: { type: 'local' },
        startMs,
        endMs,
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(endMs).toISOString(),
        timezone: data.timezone,
        allDay: data.allDay,
        title: data.title,
        description: data.description,
        location: data.location,
        occursOn: computeOccursOn(new Date(startMs).toISOString(), new Date(endMs).toISOString()),
        status: 'confirmed',
        visibility: 'default',
        transparency: 'opaque',
        recurrenceV2,
        isRecurringSeries: isRecurring,
        ...metadata
      }

      // Enqueue for sync
      await enqueueCreate(userId, newEvent)

      return newEvent
    },
    [userId]
  )

  return {
    createEvent
    // TODO: Add updateEvent, deleteEvent, etc. as needed
  }
}
