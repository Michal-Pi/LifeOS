import type {
  CanonicalCalendarEvent,
  CanonicalRecurrence,
  CanonicalRecurrenceRule,
  CanonicalResponseStatus,
  EditScope,
  Weekday,
} from '@lifeos/calendar'
import {
  computeOccursOn,
  editRecurringEvent,
  deleteRecurringEvent,
  createLogger,
} from '@lifeos/calendar'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { getUserFriendlyError } from '@/utils/errorMessages'
import { generateId } from '@lifeos/core'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { createFirestoreCompositeRepository } from '@/adapters/firestoreCompositeRepository'
import { unlinkEvent } from '@lifeos/calendar/usecases/compositeUsecases'
import type { EventFormData } from '@/components/EventFormModal'
import { functionUrl } from '@/lib/functionsUrl'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import type { OutboxOp } from '@/outbox/types'
import { listPending } from '@/outbox/store'
import { enqueueCreate, enqueueUpdate, enqueueDelete } from '@/outbox/worker'
import { getDefaultCalendarId } from '@/utils/calendarHelpers'

const logger = createLogger('useEventOperations')
const calendarRepository = createFirestoreCalendarEventRepository()
const compositeRepository = createFirestoreCompositeRepository()

interface UseEventOperationsProps {
  userId: string
  setEvents: React.Dispatch<React.SetStateAction<CanonicalCalendarEvent[]>>
  selectedEvent: CanonicalCalendarEvent | null
  setSelectedEvent: React.Dispatch<React.SetStateAction<CanonicalCalendarEvent | null>>
  setFormModalOpen: (open: boolean) => void
  setDeleteModalOpen: (open: boolean) => void
  setEditScope: (scope: EditScope | null) => void
  setPendingFormData: (data: EventFormData | null) => void
  setPendingOps: (ops: OutboxOp[]) => void
  setConnectionError: (error: string | null) => void
}

export function useEventOperations({
  userId,
  setEvents,
  selectedEvent,
  setSelectedEvent,
  setFormModalOpen,
  setDeleteModalOpen,
  setEditScope,
  setPendingFormData,
  setPendingOps,
  setConnectionError,
}: UseEventOperationsProps) {
  // Build canonical recurrence from form data
  const buildRecurrenceV2 = useCallback(
    (formData: EventFormData): CanonicalRecurrence | undefined => {
      if (!formData.recurrence || formData.recurrence.frequency === 'none') {
        return undefined
      }

      const { recurrence } = formData
      const rule: CanonicalRecurrenceRule = {
        freq: recurrence.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
      }

      if (recurrence.interval && recurrence.interval > 1) rule.interval = recurrence.interval
      if (recurrence.frequency === 'WEEKLY' && recurrence.weekdays?.length)
        rule.byWeekday = recurrence.weekdays as Weekday[]
      if (recurrence.frequency === 'MONTHLY' && recurrence.monthDay)
        rule.byMonthDay = [recurrence.monthDay]

      if (recurrence.endType === 'count' && recurrence.count) {
        rule.count = recurrence.count
      } else if (recurrence.endType === 'until' && recurrence.untilDate) {
        const untilDate = new Date(`${recurrence.untilDate}T23:59:59`)
        rule.untilMs = untilDate.getTime()
      }

      return { tz: formData.timezone, rule }
    },
    []
  )

  const createEvent = useCallback(
    async (
      data: EventFormData,
      metadata?: { taskId?: string }
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

      const attendees = data.attendees?.map((email) => ({
        email,
        responseStatus: 'needsAction' as const,
      }))

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
        attendees,
        occursOn: computeOccursOn(new Date(startMs).toISOString(), new Date(endMs).toISOString()),
        status: 'confirmed',
        visibility: 'default',
        transparency: 'opaque',
        recurrenceV2,
        isRecurringSeries: isRecurring,
        ...metadata,
      }

      setEvents((prev) => [...prev, newEvent].sort((a, b) => a.startMs - b.startMs))
      setSelectedEvent(newEvent)
      setFormModalOpen(false)

      await enqueueCreate(userId, newEvent)
      const ops = await listPending(userId)
      setPendingOps(ops)

      return newEvent
    },
    [buildRecurrenceV2, userId, setEvents, setSelectedEvent, setFormModalOpen, setPendingOps]
  )

  const updateEvent = useCallback(
    async (data: EventFormData, scope?: EditScope) => {
      if (!selectedEvent) return

      const isRecurring = Boolean(
        selectedEvent.isRecurringSeries ||
        selectedEvent.recurrenceV2?.rule ||
        selectedEvent.recurrence?.recurrenceRules?.length
      )

      if (isRecurring && scope) {
        const startMs = data.allDay
          ? new Date(`${data.startDate}T00:00:00`).getTime()
          : new Date(`${data.startDate}T${data.startTime}`).getTime()
        const endMs = data.allDay
          ? new Date(`${data.endDate}T23:59:59`).getTime()
          : new Date(`${data.endDate}T${data.endTime}`).getTime()

        try {
          const result = await editRecurringEvent(
            { repository: calendarRepository },
            {
              userId,
              eventId: selectedEvent.canonicalEventId,
              scope,
              occurrenceStartMs: scope !== 'all' ? selectedEvent.startMs : undefined,
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

          if (result.updatedMaster) {
            setEvents((prev) =>
              prev
                .map((e) =>
                  e.canonicalEventId === result.updatedMaster!.canonicalEventId
                    ? result.updatedMaster!
                    : e
                )
                .sort((a, b) => a.startMs - b.startMs)
            )
            setSelectedEvent(result.updatedMaster)
          }

          if (result.newSeries) {
            setEvents((prev) => [...prev, result.newSeries!].sort((a, b) => a.startMs - b.startMs))
          }

          setFormModalOpen(false)
          setEditScope(null)
          setPendingFormData(null)

          if (result.updatedMaster) {
            const writebackMeta =
              scope === 'this'
                ? { isInstanceEdit: true, occurrenceStartMs: selectedEvent.startMs }
                : undefined
            const baseRev = result.updatedMaster.rev ?? selectedEvent.rev
            await enqueueUpdate(userId, result.updatedMaster, baseRev, 'update', writebackMeta)
          }
          if (result.newSeries) {
            await enqueueCreate(userId, result.newSeries)
          }

          const ops = await listPending(userId)
          setPendingOps(ops)
          toast.success('Event updated successfully')
        } catch (error) {
          const errorMessage = (error as Error).message
          setConnectionError(errorMessage)
          const friendlyError = getUserFriendlyError(error as Error)
          toast.error(friendlyError.title, {
            description: friendlyError.description,
          })
        }
        return
      }

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
      const updatedEvent: CanonicalCalendarEvent = {
        ...selectedEvent,
        rev: (selectedEvent.rev ?? 0) + 1,
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
        source: { type: 'local' },
      }

      setEvents((prev) =>
        prev
          .map((e) => (e.canonicalEventId === selectedEvent.canonicalEventId ? updatedEvent : e))
          .sort((a, b) => a.startMs - b.startMs)
      )
      setSelectedEvent(updatedEvent)
      setFormModalOpen(false)

      const previousEmails = (selectedEvent.attendees ?? [])
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
        selectedEvent.rev,
        attendeesChanged ? 'update_attendees' : undefined
      )
      const ops = await listPending(userId)
      setPendingOps(ops)
    },
    [
      selectedEvent,
      userId,
      setEvents,
      setSelectedEvent,
      setFormModalOpen,
      setEditScope,
      setPendingFormData,
      setPendingOps,
      setConnectionError,
    ]
  )

  const deleteEvent = useCallback(
    async (scope?: EditScope) => {
      if (!selectedEvent) return

      const isRecurring = Boolean(
        selectedEvent.isRecurringSeries ||
        selectedEvent.recurrenceV2?.rule ||
        selectedEvent.recurrence?.recurrenceRules?.length
      )

      if (isRecurring && scope) {
        try {
          const result = await deleteRecurringEvent(
            { repository: calendarRepository },
            {
              userId,
              eventId: selectedEvent.canonicalEventId,
              scope,
              occurrenceStartMs: scope !== 'all' ? selectedEvent.startMs : undefined,
            }
          )

          if (result.deletedSeriesId) {
            // Unlink from composite before deleting
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
              logger.warn('Failed to unlink from composite', err)
            }

            setEvents((prev) => prev.filter((e) => e.canonicalEventId !== result.deletedSeriesId))
            setSelectedEvent(null)
            await enqueueDelete(
              userId,
              result.deletedSeriesId,
              selectedEvent.rev,
              selectedEvent.updatedAtMs
            )
          } else if (result.updatedMaster) {
            setEvents((prev) =>
              prev
                .map((e) =>
                  e.canonicalEventId === result.updatedMaster!.canonicalEventId
                    ? result.updatedMaster!
                    : e
                )
                .sort((a, b) => a.startMs - b.startMs)
            )
            setSelectedEvent(result.updatedMaster)
            await enqueueUpdate(
              userId,
              result.updatedMaster,
              result.updatedMaster.rev ?? selectedEvent.rev
            )
          }

          setDeleteModalOpen(false)
          const ops = await listPending(userId)
          setPendingOps(ops)
          toast.success('Event deleted successfully')
        } catch (error) {
          const errorMessage = (error as Error).message
          setConnectionError(errorMessage)
          const friendlyError = getUserFriendlyError(error as Error)
          toast.error(friendlyError.title, {
            description: friendlyError.description,
          })
        }
        return
      }

      // Unlink from composite before deleting
      try {
        const composites = await compositeRepository.findByCanonicalEventId(
          userId,
          selectedEvent.canonicalEventId
        )
        if (composites.length > 0) {
          await unlinkEvent(
            { compositeRepository, eventRepository: calendarRepository },
            {
              userId,
              compositeEventId: composites[0].id ?? composites[0].compositeEventId ?? '',
              canonicalEventId: selectedEvent.canonicalEventId,
            }
          )
        }
      } catch (err) {
        logger.warn('Failed to unlink from composite', err)
      }

      setEvents((prev) => prev.filter((e) => e.canonicalEventId !== selectedEvent.canonicalEventId))
      setDeleteModalOpen(false)
      setSelectedEvent(null)

      await enqueueDelete(
        userId,
        selectedEvent.canonicalEventId,
        selectedEvent.rev,
        selectedEvent.updatedAtMs
      )
      const ops = await listPending(userId)
      setPendingOps(ops)
    },
    [
      selectedEvent,
      userId,
      setEvents,
      setSelectedEvent,
      setDeleteModalOpen,
      setPendingOps,
      setConnectionError,
    ]
  )

  const retryWriteback = useCallback(async () => {
    if (!selectedEvent) return

    try {
      const response = await authenticatedFetch(
        functionUrl(`retryWriteback?uid=${userId}&eventId=${selectedEvent.canonicalEventId}`)
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Retry failed')
      }

      const updatedEvent = {
        ...selectedEvent,
        syncState: 'pending_writeback' as const,
        writebackError: undefined,
      }
      setEvents((prev) =>
        prev.map((e) => (e.canonicalEventId === selectedEvent.canonicalEventId ? updatedEvent : e))
      )
      setSelectedEvent(updatedEvent)
      toast.success('Writeback retry scheduled')
    } catch (error) {
      const errorMessage = (error as Error).message
      setConnectionError(errorMessage)
      const friendlyError = getUserFriendlyError(error as Error)
      toast.error(friendlyError.title, {
        description: friendlyError.description,
      })
    }
  }, [selectedEvent, userId, setEvents, setSelectedEvent, setConnectionError])

  const rsvpEvent = useCallback(
    async (
      eventId: string,
      responseStatus: CanonicalResponseStatus,
      events: CanonicalCalendarEvent[]
    ) => {
      const event = events.find((e) => e.canonicalEventId === eventId)
      if (!event) return

      const attendees = event.attendees ?? []
      const selfIndex = attendees.findIndex((a) => a.self)

      const updatedAttendees =
        selfIndex >= 0
          ? attendees.map((a, i) => (i === selfIndex ? { ...a, responseStatus } : a))
          : attendees

      const updatedEvent: CanonicalCalendarEvent = {
        ...event,
        attendees: updatedAttendees,
        selfAttendee:
          selfIndex >= 0 ? { ...attendees[selfIndex], responseStatus } : event.selfAttendee,
        canonicalUpdatedAtMs: Date.now(),
        syncState: 'pending_writeback' as const,
        source: { type: 'local' as const },
      }

      setEvents((prev) => prev.map((e) => (e.canonicalEventId === eventId ? updatedEvent : e)))
      if (selectedEvent?.canonicalEventId === eventId) {
        setSelectedEvent(updatedEvent)
      }

      try {
        await enqueueUpdate(userId, updatedEvent, event.rev, 'rsvp')
        toast.success('RSVP updated successfully')
      } catch (error) {
        logger.error('Failed to enqueue RSVP update', error)
        setEvents((prev) => prev.map((e) => (e.canonicalEventId === eventId ? event : e)))
        if (selectedEvent?.canonicalEventId === eventId) {
          setSelectedEvent(event)
        }
        const friendlyError = getUserFriendlyError(error as Error)
        toast.error(friendlyError.title, {
          description: friendlyError.description,
        })
      }
    },
    [selectedEvent, userId, setEvents, setSelectedEvent]
  )

  return {
    createEvent,
    updateEvent,
    deleteEvent,
    retryWriteback,
    rsvpEvent,
  }
}
