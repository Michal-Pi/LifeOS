/**
 * Recurring Events Management Use Cases
 *
 * This module implements the complex business logic for managing recurring calendar events.
 * Recurring events in LifeOS support:
 *
 * - Multiple recurrence patterns (daily, weekly, monthly, yearly)
 * - End conditions (until date or occurrence count)
 * - Individual instance modifications (overrides)
 * - Series modifications with scope selection ("this", "this and future", "all")
 * - Series splitting for future-only changes
 * - Instance exclusions (deletions of specific occurrences)
 *
 * Key Concepts:
 * - Master Series: The template event that defines the recurrence pattern
 * - Instances: Generated occurrences of the series at specific times
 * - Overrides: Modified properties for specific instances
 * - Exceptions: Excluded instances (effectively deleted)
 * - Splits: When "this and future" creates a new series from a split point
 *
 * Scope-Based Editing:
 * - "this": Creates an override for this specific instance
 * - "this and future": Splits series, truncates original, creates new series
 * - "all": Modifies the master series affecting all instances
 */

import { generateId } from '@lifeos/core'
import type { CanonicalCalendarEvent } from '../domain/models'
import { computeOccursOn, isDeleted, isRecurringSeries } from '../domain/models'
import { getPreviousOccurrence } from '../domain/recurrence/generateInstances'
import type {
  CanonicalEventOverride,
  CanonicalRecurrence,
  CanonicalRecurrenceRule,
} from '../domain/recurrence/types'
import type { CalendarEventRepository } from '../ports/calendarRepository'

export interface RecurrenceUsecaseDeps {
  repository: CalendarEventRepository
}

/**
 * Edit scope for recurring events
 */
export type EditScope = 'this' | 'this_and_future' | 'all'

// ==================== Create Recurring Series ====================

export interface CreateRecurringSeriesInput {
  userId: string
  title: string
  location?: string
  description?: string
  startMs: number
  endMs: number
  allDay?: boolean
  timezone?: string
  calendarId?: string
  rule: CanonicalRecurrenceRule
  targetProvider?: 'google' | 'local'
  targetAccountId?: string
  targetProviderCalendarId?: string
}

/**
 * Create a new recurring series
 */
export async function createRecurringSeries(
  deps: RecurrenceUsecaseDeps,
  input: CreateRecurringSeriesInput
): Promise<CanonicalCalendarEvent> {
  const nowMs = Date.now()

  // Validate rule
  if (!input.rule.freq) {
    throw new Error('Recurrence rule must have a frequency')
  }

  // Build recurrence
  const recurrenceV2: CanonicalRecurrence = {
    tz: input.timezone,
    rule: {
      ...input.rule,
      interval: input.rule.interval ?? 1,
    },
  }

  const hasTargetProvider = Boolean(input.targetProvider && input.targetProvider !== 'local')

  const event: CanonicalCalendarEvent = {
    canonicalEventId: `local:${generateId()}`,
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: input.targetProvider ?? 'local',
      accountId: input.targetAccountId ?? 'local',
      providerCalendarId: input.targetProviderCalendarId ?? input.calendarId ?? 'local',
      providerEventId: `local:${generateId()}`,
    },
    primaryProvider: input.targetProvider,
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: hasTargetProvider ? 'pending_writeback' : 'synced',
    source: { type: 'local' },
    // Event fields
    startMs: input.startMs,
    endMs: input.endMs,
    startIso: new Date(input.startMs).toISOString(),
    endIso: new Date(input.endMs).toISOString(),
    timezone: input.timezone,
    allDay: input.allDay,
    title: input.title,
    description: input.description,
    location: input.location,
    occursOn: computeOccursOn(
      new Date(input.startMs).toISOString(),
      new Date(input.endMs).toISOString()
    ),
    // Recurrence
    recurrenceV2,
    isRecurringSeries: true,
    status: 'confirmed',
    visibility: 'default',
    transparency: 'opaque',
    calendarId: input.calendarId,
  }

  await deps.repository.createEvent(input.userId, event)
  return event
}

// ==================== Edit Recurring Event ====================

export interface EditRecurringEventInput {
  userId: string
  eventId: string // For 'all', this is the series ID. For 'this'/'this_and_future', this is the instance ID
  scope: EditScope
  occurrenceStartMs?: number // Required for 'this' and 'this_and_future'
  patch: {
    title?: string
    description?: string
    location?: string
    startMs?: number
    endMs?: number
    allDay?: boolean
    timezone?: string
  }
}

export interface EditRecurringEventResult {
  updatedMaster?: CanonicalCalendarEvent
  newSeries?: CanonicalCalendarEvent // For 'this_and_future' split
  overrideKey?: string // For 'this' override
}

/**
 * Edit a recurring event with scope-based modifications
 *
 * This is the core function for modifying recurring events. It handles the complex
 * logic of applying changes to different scopes of a recurring series:
 *
 * Scope Behavior:
 * - "all": Modifies the master series, affecting all past and future instances
 * - "this": Creates an override for this specific instance only
 * - "this_and_future": Splits the series at this point, creating a new series
 *
 * Example Scenarios:
 * - Change "Team Standup" time for just today → "this" scope
 * - Move all future "Team Standup" to a new location → "this_and_future" scope
 * - Rename the entire "Team Standup" series → "all" scope
 *
 * @param deps - Repository dependencies
 * @param input - Edit parameters including scope and changes
 * @returns Result with updated master and/or new series
 */
export async function editRecurringEvent(
  deps: RecurrenceUsecaseDeps,
  input: EditRecurringEventInput
): Promise<EditRecurringEventResult> {
  const { userId, eventId, scope, occurrenceStartMs, patch } = input

  // Get the series master
  const seriesId = extractSeriesId(eventId)
  const master = await deps.repository.getById(userId, seriesId)

  if (!master || isDeleted(master)) {
    throw new Error('Series not found')
  }

  if (!isRecurringSeries(master)) {
    throw new Error('Event is not a recurring series')
  }

  const nowMs = Date.now()

  switch (scope) {
    case 'all':
      return editAllInstances(deps, master, patch, nowMs)

    case 'this':
      if (occurrenceStartMs === undefined) {
        throw new Error('occurrenceStartMs required for "this" scope')
      }
      return editSingleInstance(deps, master, occurrenceStartMs, patch, nowMs)

    case 'this_and_future':
      if (occurrenceStartMs === undefined) {
        throw new Error('occurrenceStartMs required for "this_and_future" scope')
      }
      return editThisAndFuture(deps, userId, master, occurrenceStartMs, patch, nowMs)

    default:
      throw new Error(`Unknown scope: ${scope}`)
  }
}

/**
 * Edit all instances (modify the master)
 */
async function editAllInstances(
  deps: RecurrenceUsecaseDeps,
  master: CanonicalCalendarEvent,
  patch: EditRecurringEventInput['patch'],
  nowMs: number
): Promise<EditRecurringEventResult> {
  const updated: CanonicalCalendarEvent = {
    ...master,
    ...patch,
    updatedAt: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: master.providerRef.provider !== 'local' ? 'pending_writeback' : master.syncState,
    source: { type: 'local' },
  }

  // Update occursOn if times changed
  if (patch.startMs !== undefined || patch.endMs !== undefined) {
    updated.startIso = new Date(patch.startMs ?? master.startMs).toISOString()
    updated.endIso = new Date(patch.endMs ?? master.endMs).toISOString()
    updated.occursOn = computeOccursOn(updated.startIso, updated.endIso)
  }

  await deps.repository.updateEvent('', master.canonicalEventId, updated)

  return { updatedMaster: updated }
}

/**
 * Edit a single instance (create an override)
 */
async function editSingleInstance(
  deps: RecurrenceUsecaseDeps,
  master: CanonicalCalendarEvent,
  occurrenceStartMs: number,
  patch: EditRecurringEventInput['patch'],
  nowMs: number
): Promise<EditRecurringEventResult> {
  const recurrence = master.recurrenceV2
  if (!recurrence) {
    throw new Error('Series has no recurrence data')
  }

  // Build override
  const overrideKey = `${occurrenceStartMs}`
  const override: CanonicalEventOverride = {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.location !== undefined && { location: patch.location }),
    ...(patch.startMs !== undefined && { startMs: patch.startMs }),
    ...(patch.endMs !== undefined && { endMs: patch.endMs }),
    ...(patch.allDay !== undefined && { allDay: patch.allDay }),
    updatedAtMs: nowMs,
  }

  // Update master with override
  const updatedRecurrence: CanonicalRecurrence = {
    ...recurrence,
    overrides: {
      ...recurrence.overrides,
      [overrideKey]: override,
    },
  }

  const updated: CanonicalCalendarEvent = {
    ...master,
    recurrenceV2: updatedRecurrence,
    updatedAt: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: master.providerRef.provider !== 'local' ? 'pending_writeback' : master.syncState,
    source: { type: 'local' },
  }

  await deps.repository.updateEvent('', master.canonicalEventId, updated)

  return { updatedMaster: updated, overrideKey }
}

/**
 * Edit this and future (split the series)
 */
async function editThisAndFuture(
  deps: RecurrenceUsecaseDeps,
  userId: string,
  master: CanonicalCalendarEvent,
  splitAtMs: number,
  patch: EditRecurringEventInput['patch'],
  nowMs: number
): Promise<EditRecurringEventResult> {
  const recurrence = master.recurrenceV2
  if (!recurrence) {
    throw new Error('Series has no recurrence data')
  }

  // Find the previous occurrence to set as the new until
  const previousOccurrence = getPreviousOccurrence(recurrence, master.startMs, splitAtMs)
  const newUntilMs = previousOccurrence ?? splitAtMs - 1

  // Update old master to end before split
  const updatedOldRecurrence: CanonicalRecurrence = {
    ...recurrence,
    rule: {
      ...recurrence.rule,
      untilMs: newUntilMs,
      count: undefined, // Remove count if present
    },
    split: {
      splitAtMs,
      childSeriesId: undefined, // Will be set after creating new series
    },
  }

  const updatedMaster: CanonicalCalendarEvent = {
    ...master,
    recurrenceV2: updatedOldRecurrence,
    updatedAt: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: master.providerRef.provider !== 'local' ? 'pending_writeback' : master.syncState,
    source: { type: 'local' },
  }

  // Create new series starting at split point
  const newSeriesId = `local:${generateId()}`
  const newStartMs = patch.startMs ?? splitAtMs
  const duration = master.endMs - master.startMs
  const newEndMs = patch.endMs ?? newStartMs + duration

  // Inherit the recurrence rule but start from split point
  const newRecurrence: CanonicalRecurrence = {
    tz: recurrence.tz,
    rule: { ...recurrence.rule, untilMs: recurrence.rule.untilMs, count: undefined },
    split: {
      splitAtMs,
      parentSeriesId: master.canonicalEventId,
    },
  }

  const newSeries: CanonicalCalendarEvent = {
    canonicalEventId: newSeriesId,
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      ...master.providerRef,
      providerEventId: `local:${generateId()}`,
    },
    primaryProvider: master.primaryProvider,
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: master.providerRef.provider !== 'local' ? 'pending_writeback' : 'synced',
    source: { type: 'local' },
    // Inherit fields with patches
    title: patch.title ?? master.title,
    description: patch.description ?? master.description,
    location: patch.location ?? master.location,
    startMs: newStartMs,
    endMs: newEndMs,
    startIso: new Date(newStartMs).toISOString(),
    endIso: new Date(newEndMs).toISOString(),
    timezone: patch.timezone ?? master.timezone,
    allDay: patch.allDay ?? master.allDay,
    occursOn: computeOccursOn(new Date(newStartMs).toISOString(), new Date(newEndMs).toISOString()),
    recurrenceV2: newRecurrence,
    isRecurringSeries: true,
    status: master.status,
    visibility: master.visibility,
    transparency: master.transparency,
    calendarId: master.calendarId,
  }

  // Update old master with child reference
  updatedMaster.recurrenceV2!.split!.childSeriesId = newSeriesId

  // Save both
  await deps.repository.updateEvent('', master.canonicalEventId, updatedMaster)
  await deps.repository.createEvent(userId, newSeries)

  return { updatedMaster, newSeries }
}

// ==================== Delete Recurring Event ====================

export interface DeleteRecurringEventInput {
  userId: string
  eventId: string
  scope: EditScope
  occurrenceStartMs?: number
}

export interface DeleteRecurringEventResult {
  updatedMaster?: CanonicalCalendarEvent
  deletedSeriesId?: string
}

/**
 * Delete a recurring event with scope selection
 */
export async function deleteRecurringEvent(
  deps: RecurrenceUsecaseDeps,
  input: DeleteRecurringEventInput
): Promise<DeleteRecurringEventResult> {
  const { userId, eventId, scope, occurrenceStartMs } = input

  const seriesId = extractSeriesId(eventId)
  const master = await deps.repository.getById(userId, seriesId)

  if (!master || isDeleted(master)) {
    throw new Error('Series not found')
  }

  if (!isRecurringSeries(master)) {
    throw new Error('Event is not a recurring series')
  }

  const nowMs = Date.now()

  switch (scope) {
    case 'all':
      return deleteAllInstances(deps, userId, master, nowMs)

    case 'this':
      if (occurrenceStartMs === undefined) {
        throw new Error('occurrenceStartMs required for "this" scope')
      }
      return deleteSingleInstance(deps, master, occurrenceStartMs, nowMs)

    case 'this_and_future':
      if (occurrenceStartMs === undefined) {
        throw new Error('occurrenceStartMs required for "this_and_future" scope')
      }
      return deleteThisAndFuture(deps, master, occurrenceStartMs, nowMs)

    default:
      throw new Error(`Unknown scope: ${scope}`)
  }
}

/**
 * Delete entire series
 */
async function deleteAllInstances(
  deps: RecurrenceUsecaseDeps,
  userId: string,
  master: CanonicalCalendarEvent,
  _nowMs: number
): Promise<DeleteRecurringEventResult> {
  await deps.repository.deleteEvent(userId, master.canonicalEventId)
  return { deletedSeriesId: master.canonicalEventId }
}

/**
 * Delete a single instance (add to exdates)
 */
async function deleteSingleInstance(
  deps: RecurrenceUsecaseDeps,
  master: CanonicalCalendarEvent,
  occurrenceStartMs: number,
  nowMs: number
): Promise<DeleteRecurringEventResult> {
  const recurrence = master.recurrenceV2
  if (!recurrence) {
    throw new Error('Series has no recurrence data')
  }

  // Add to exdates
  const updatedRecurrence: CanonicalRecurrence = {
    ...recurrence,
    exdatesMs: [...(recurrence.exdatesMs ?? []), occurrenceStartMs],
  }

  const updated: CanonicalCalendarEvent = {
    ...master,
    recurrenceV2: updatedRecurrence,
    updatedAt: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: master.providerRef.provider !== 'local' ? 'pending_writeback' : master.syncState,
    source: { type: 'local' },
  }

  await deps.repository.updateEvent('', master.canonicalEventId, updated)

  return { updatedMaster: updated }
}

/**
 * Delete this and future (end series at this point)
 */
async function deleteThisAndFuture(
  deps: RecurrenceUsecaseDeps,
  master: CanonicalCalendarEvent,
  deleteFromMs: number,
  nowMs: number
): Promise<DeleteRecurringEventResult> {
  const recurrence = master.recurrenceV2
  if (!recurrence) {
    throw new Error('Series has no recurrence data')
  }

  // Find previous occurrence
  const previousOccurrence = getPreviousOccurrence(recurrence, master.startMs, deleteFromMs)
  const newUntilMs = previousOccurrence ?? deleteFromMs - 1

  // Update rule to end before deleted occurrence
  const updatedRecurrence: CanonicalRecurrence = {
    ...recurrence,
    rule: {
      ...recurrence.rule,
      untilMs: newUntilMs,
      count: undefined,
    },
  }

  const updated: CanonicalCalendarEvent = {
    ...master,
    recurrenceV2: updatedRecurrence,
    updatedAt: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: master.providerRef.provider !== 'local' ? 'pending_writeback' : master.syncState,
    source: { type: 'local' },
  }

  await deps.repository.updateEvent('', master.canonicalEventId, updated)

  return { updatedMaster: updated }
}

// ==================== Helpers ====================

/**
 * Extract series ID from an event ID or instance ID
 */
function extractSeriesId(eventId: string): string {
  // Instance IDs are formatted as seriesId:occurrenceStartMs
  const lastColon = eventId.lastIndexOf(':')
  if (lastColon === -1) return eventId

  // Check if the part after colon is a timestamp
  const suffix = eventId.substring(lastColon + 1)
  const maybeTimestamp = parseInt(suffix, 10)

  // If it's a large number (timestamp), extract the series ID
  if (!isNaN(maybeTimestamp) && maybeTimestamp > 1000000000000) {
    return eventId.substring(0, lastColon)
  }

  return eventId
}
