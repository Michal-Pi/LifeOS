/**
 * useEventService - Business Logic Layer
 *
 * Provides event CRUD operations without UI state dependencies.
 * Use this hook when you need event operations but don't need UI state management.
 *
 * Example usage in PlannerPage:
 *   const eventService = useEventService(userId)
 *   const newEvent = await eventService.createEvent(formData, { taskId: task.id })
 */

import { useCallback } from 'react'
import type {
  CanonicalCalendarEvent,
  CanonicalRecurrence,
  CanonicalRecurrenceRule,
  Weekday,
  EditScope,
} from '@lifeos/calendar'
import { computeOccursOn, editRecurringEvent, deleteRecurringEvent } from '@lifeos/calendar'
import type { EventFormData } from '@/components/EventFormModal'
import { generateId } from '@/lib/idGenerator'
import { enqueueCreate, enqueueUpdate, enqueueDelete } from '@/outbox/worker'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { createFirestoreCompositeRepository } from '@/adapters/firestoreCompositeRepository'
import { unlinkEvent } from '@lifeos/calendar/usecases/compositeUsecases'
import { getDefaultCalendarId } from '@/utils/calendarHelpers'

interface UseEventServiceProps {
  userId: string
}

const calendarRepository = createFirestoreCalendarEventRepository()
const compositeRepository = createFirestoreCompositeRepository()

/**
 * Build canonical recurrence from form data
 */
function buildRecurrenceV2(formData: EventFormData): CanonicalRecurrence | undefined {
  if (!formData.recurrence || formData.recurrence.frequency === 'none') {
    return undefined
  }

  const { recurrence } = formData
  const rule: CanonicalRecurrenceRule = {
    freq: recurrence.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
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
    async (
      data: EventFormData,
      metadata?: Record<string, unknown>
    ): Promise<CanonicalCalendarEvent> => {
      const startMs = data.allDay
        ? new Date(`${data.startDate}T00:00:00`).getTime()
        : new Date(`${data.startDate}T${data.startTime}`).getTime()
      const endMs = data.allDay
        ? new Date(`${data.endDate}T23:59:59`).getTime()
        : new Date(`${data.endDate}T${data.endTime}`).getTime()

      const nowMs = Date.now()
      const recurrenceV2 = buildRecurrenceV2(data)
      const isRecurring = Boolean(recurrenceV2)

      // Get default calendar ID (from metadata, or fetch user's default)
      const calendarId =
        (metadata?.calendarId as string | undefined) ||
        (await getDefaultCalendarId(userId)) ||
        'local:primary'

      const newEvent: CanonicalCalendarEvent = {
        canonicalEventId: `local:${generateId()}`,
        schemaVersion: 1,
        normalizationVersion: 1,
        providerRef: {
          provider: 'local',
          accountId: 'local',
          providerCalendarId: 'local',
          providerEventId: `local:${generateId()}`,
        },
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        canonicalUpdatedAtMs: nowMs,
        syncState: 'pending_writeback',
        source: { type: 'local' },
        calendarId, // Set calendar ID for permission lookups and color mapping
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
        ...metadata,
      }

      // Enqueue for sync
      await enqueueCreate(userId, newEvent)

      return newEvent
    },
    [userId]
  )

  /**
   * Update an existing calendar event
   * @param eventId The ID of the event to update
   * @param data Event form data with updated values
   * @param scope Optional scope for recurring events ('this', 'this_and_future', 'all')
   * @returns The updated event(s)
   */
  const updateEvent = useCallback(
    async (
      eventId: string,
      data: EventFormData,
      scope?: EditScope
    ): Promise<{ updatedEvent?: CanonicalCalendarEvent; newSeries?: CanonicalCalendarEvent }> => {
      // First, get the existing event to check if it's recurring
      const existingEvent = await calendarRepository.getById(userId, eventId)
      if (!existingEvent) {
        throw new Error(`Event not found: ${eventId}`)
      }

      const isRecurring = Boolean(
        existingEvent.isRecurringSeries ||
        existingEvent.recurrenceV2?.rule ||
        existingEvent.recurrence?.recurrenceRules?.length
      )

      // Handle recurring events
      if (isRecurring && scope) {
        const startMs = data.allDay
          ? new Date(`${data.startDate}T00:00:00`).getTime()
          : new Date(`${data.startDate}T${data.startTime}`).getTime()
        const endMs = data.allDay
          ? new Date(`${data.endDate}T23:59:59`).getTime()
          : new Date(`${data.endDate}T${data.endTime}`).getTime()

        const result = await editRecurringEvent(
          { repository: calendarRepository },
          {
            userId,
            eventId: existingEvent.canonicalEventId,
            scope,
            occurrenceStartMs: scope !== 'all' ? existingEvent.startMs : undefined,
            patch: {
              title: data.title,
              description: data.description,
              location: data.location,
              startMs,
              endMs,
              allDay: data.allDay,
              timezone: data.timezone,
            },
          }
        )

        // Enqueue updates for sync
        if (result.updatedMaster) {
          const writebackMeta =
            scope === 'this'
              ? { isInstanceEdit: true, occurrenceStartMs: existingEvent.startMs }
              : undefined
          await enqueueUpdate(
            userId,
            result.updatedMaster,
            existingEvent.rev,
            'update',
            writebackMeta
          )
        }
        if (result.newSeries) {
          await enqueueCreate(userId, result.newSeries)
        }

        return {
          updatedEvent: result.updatedMaster,
          newSeries: result.newSeries,
        }
      }

      // Handle non-recurring events or recurring events without scope (update all)
      const startMs = data.allDay
        ? new Date(`${data.startDate}T00:00:00`).getTime()
        : new Date(`${data.startDate}T${data.startTime}`).getTime()
      const endMs = data.allDay
        ? new Date(`${data.endDate}T23:59:59`).getTime()
        : new Date(`${data.endDate}T${data.endTime}`).getTime()

      const nowMs = Date.now()
      const attendees = data.attendees?.map((email) => ({
        email,
        responseStatus: 'needsAction' as const,
      }))

      const recurrenceV2 = buildRecurrenceV2(data)
      const isRecurringSeries = Boolean(recurrenceV2)

      const updatedEvent: CanonicalCalendarEvent = {
        ...existingEvent,
        rev: (existingEvent.rev ?? 0) + 1,
        updatedAt: new Date(nowMs).toISOString(),
        updatedAtMs: nowMs,
        canonicalUpdatedAtMs: nowMs,
        startMs,
        endMs,
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(endMs).toISOString(),
        timezone: data.timezone,
        allDay: data.allDay,
        title: data.title,
        description: data.description,
        location: data.location,
        attendees,
        occursOn: computeOccursOn(new Date(startMs).toISOString(), new Date(endMs).toISOString()),
        recurrenceV2,
        isRecurringSeries,
        source: { type: 'local' },
      }

      // Check if attendees changed for writeback operation type
      const previousEmails = (existingEvent.attendees ?? [])
        .map((attendee) => attendee.email)
        .filter((email): email is string => Boolean(email))
        .sort()
      const nextEmails = (attendees ?? [])
        .map((attendee) => attendee.email)
        .filter((email): email is string => Boolean(email))
        .sort()
      const attendeesChanged = previousEmails.join('|') !== nextEmails.join('|')

      await enqueueUpdate(
        userId,
        updatedEvent,
        existingEvent.rev,
        attendeesChanged ? 'update_attendees' : undefined
      )

      return { updatedEvent }
    },
    [userId]
  )

  /**
   * Delete a calendar event
   * @param eventId The ID of the event to delete
   * @param scope Optional scope for recurring events ('this', 'this_and_future', 'all')
   */
  const deleteEvent = useCallback(
    async (eventId: string, scope?: EditScope): Promise<void> => {
      // First, get the existing event to check if it's recurring
      const existingEvent = await calendarRepository.getById(userId, eventId)
      if (!existingEvent) {
        throw new Error(`Event not found: ${eventId}`)
      }

      const isRecurring = Boolean(
        existingEvent.isRecurringSeries ||
        existingEvent.recurrenceV2?.rule ||
        existingEvent.recurrence?.recurrenceRules?.length
      )

      // Handle recurring events
      if (isRecurring && scope) {
        const result = await deleteRecurringEvent(
          { repository: calendarRepository },
          {
            userId,
            eventId: existingEvent.canonicalEventId,
            scope,
            occurrenceStartMs: scope !== 'all' ? existingEvent.startMs : undefined,
          }
        )

        // Handle composite unlinking if needed
        if (result.deletedSeriesId) {
          try {
            const composites = await compositeRepository.findByCanonicalEventId(
              userId,
              result.deletedSeriesId
            )
            if (composites.length > 0) {
              await unlinkEvent(
                { compositeRepository, eventRepository: calendarRepository },
                {
                  userId,
                  compositeEventId: composites[0].id ?? composites[0].compositeEventId ?? '',
                  canonicalEventId: result.deletedSeriesId,
                }
              )
            }
          } catch (err) {
            console.warn('Failed to unlink from composite', err)
          }

          await enqueueDelete(
            userId,
            result.deletedSeriesId,
            existingEvent.rev,
            existingEvent.updatedAtMs
          )
        } else if (result.updatedMaster) {
          await enqueueUpdate(
            userId,
            result.updatedMaster,
            result.updatedMaster.rev ?? existingEvent.rev
          )
        }

        return
      }

      // Handle non-recurring events or recurring events without scope (delete all)
      await enqueueDelete(userId, eventId, existingEvent.rev, existingEvent.updatedAtMs)
    },
    [userId]
  )

  return {
    createEvent,
    updateEvent,
    deleteEvent,
  }
}
