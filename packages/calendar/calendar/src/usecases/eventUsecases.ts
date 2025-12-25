/**
 * Event Management Use Cases - Core CRUD Operations
 *
 * This module implements the core business logic for creating, reading, updating,
 * and deleting calendar events. It serves as the application layer that:
 *
 * - Validates business rules (e.g., end time after start time)
 * - Manages sync state transitions
 * - Handles provider-specific constraints
 * - Ensures data consistency across operations
 * - Implements optimistic updates for better UX
 *
 * Architecture Notes:
 * - Uses dependency injection for repository access
 * - Maintains separation between domain logic and data persistence
 * - Handles both local-only and synced events
 * - Supports conflict resolution through base revision checking
 */

import { generateId } from '@lifeos/core'
import { computeOccursOn, isDeleted, type CanonicalCalendarEvent, type SyncState } from '../domain/models'
import type { CalendarEventRepository } from '../ports/calendarRepository'

export interface CreateEventInput {
  userId: string
  title: string
  location?: string
  description?: string
  startMs: number
  endMs: number
  allDay?: boolean
  calendarId?: string
  timezone?: string
  // Optional: target a specific provider for writeback
  targetProvider?: 'google' | 'local'
  targetAccountId?: string
  targetProviderCalendarId?: string
}

export interface UpdateEventInput {
  userId: string
  eventId: string
  patch: Partial<Pick<CanonicalCalendarEvent, 'title' | 'location' | 'description' | 'startMs' | 'endMs' | 'startIso' | 'endIso' | 'timezone' | 'allDay'>>
  baseUpdatedAtMs?: number
}

export interface DeleteEventInput {
  userId: string
  eventId: string
  baseUpdatedAtMs?: number
}

export interface EventUsecaseDeps {
  repository: CalendarEventRepository
}

function validateTime(startMs: number, endMs: number, allDay = false) {
  if (allDay) {
    if (endMs <= startMs) {
      throw new Error('All-day events must end after they start')
    }
  } else if (endMs <= startMs) {
    throw new Error('Timed events must end after they start')
  }
}

/**
 * Determine if an event can be written back to a provider
 */
export function canWriteBack(event: CanonicalCalendarEvent): { canWrite: boolean; reason?: string } {
  // Recurring events cannot be written back yet
  if (event.recurrence?.recurrenceRules?.length || event.providerRef.recurringEventId) {
    return { canWrite: false, reason: 'recurring_event_not_supported' }
  }

  // Local-only events with no target provider can be modified locally but not written back
  if (event.providerRef.provider === 'local' && !event.primaryProvider) {
    return { canWrite: true, reason: 'local_only' }
  }

  return { canWrite: true }
}

/**
 * Get the initial sync state for a new local event
 */
function getInitialSyncState(hasTargetProvider: boolean): SyncState {
  return hasTargetProvider ? 'pending_writeback' : 'synced'
}

/**
 * Create a new calendar event
 *
 * This is the primary entry point for creating calendar events in LifeOS.
 * It handles both local-only events and events that will sync to external providers.
 *
 * Business Logic:
 * 1. Validates time constraints (end after start)
 * 2. Generates unique canonical ID with "local:" prefix
 * 3. Sets appropriate sync state based on target provider
 * 4. Initializes all required metadata fields
 * 5. Computes occurrence dates for multi-day events
 * 6. Persists to repository with optimistic update
 *
 * Sync Behavior:
 * - Local events: syncState = 'synced' (no sync needed)
 * - Provider events: syncState = 'pending_writeback' (queued for sync)
 *
 * @param deps - Dependencies including repository access
 * @param input - Event creation parameters
 * @returns The newly created canonical event
 */
export async function createEvent(deps: EventUsecaseDeps, input: CreateEventInput): Promise<CanonicalCalendarEvent> {
  // Validate business rules before creating
  validateTime(input.startMs, input.endMs, Boolean(input.allDay))
  const nowMs = Date.now()

  // Determine if this event will sync to an external provider
  const hasTargetProvider = Boolean(input.targetProvider && input.targetProvider !== 'local')
  const syncState = getInitialSyncState(hasTargetProvider)

  const canonicalEvent: CanonicalCalendarEvent = {
    canonicalEventId: `local:${generateId()}`,
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: input.targetProvider ?? 'local',
      accountId: input.targetAccountId ?? 'local',
      providerCalendarId: input.targetProviderCalendarId ?? input.calendarId ?? 'local',
      providerEventId: `local:${generateId()}` // Will be replaced after writeback
    },
    primaryProvider: input.targetProvider,
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    // Phase 2.2 sync metadata
    canonicalUpdatedAtMs: nowMs,
    syncState,
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
    calendarId: input.calendarId,
    status: 'confirmed',
    visibility: 'default',
    transparency: 'opaque'
  }
  await deps.repository.createEvent(input.userId, canonicalEvent)
  return canonicalEvent
}

/**
 * Update an existing calendar event
 *
 * Handles modifications to calendar events with proper sync state management
 * and conflict resolution support.
 *
 * Business Logic:
 * 1. Fetches current event state for conflict detection
 * 2. Validates the update is allowed (not deleted, permissions)
 * 3. Determines appropriate sync state based on provider capabilities
 * 4. Applies optimistic update with new timestamps
 * 5. Recomputes occurrence dates if time changed
 * 6. Uses base revision for conflict resolution
 *
 * Sync State Logic:
 * - Provider events: → 'pending_writeback' (queue for sync)
 * - Read-only events: → 'read_only_provider' (block changes)
 * - Local-only events: → 'synced' (no sync needed)
 *
 * @param deps - Dependencies including repository access
 * @param input - Update parameters with base revision for conflict detection
 * @returns The updated canonical event
 */
export async function updateEvent(deps: EventUsecaseDeps, input: UpdateEventInput): Promise<CanonicalCalendarEvent> {
  // Fetch current state for conflict detection and validation
  const existing = await deps.repository.getById(input.userId, input.eventId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Event not found or deleted')
  }
  const nowMs = Date.now()

  // Determine sync behavior based on provider configuration
  const hasProvider = existing.providerRef.provider !== 'local' || Boolean(existing.primaryProvider)
  const { canWrite, reason } = canWriteBack(existing)

  let newSyncState: SyncState = existing.syncState
  let writebackBlockedReason: string | undefined = existing.writebackBlockedReason

  if (hasProvider) {
    if (canWrite) {
      newSyncState = 'pending_writeback'
      writebackBlockedReason = undefined
    } else {
      newSyncState = 'read_only_provider'
      writebackBlockedReason = reason
    }
  }

  const updated: CanonicalCalendarEvent = {
    ...existing,
    ...input.patch,
    updatedAt: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    syncState: newSyncState,
    writebackBlockedReason,
    // Clear any previous error since we're making a new change
    writebackError: undefined,
    occursOn: computeOccursOn(
      input.patch.startIso ?? existing.startIso,
      input.patch.endIso ?? existing.endIso
    ),
    source: { type: 'local' }
  }

  {
    const start = input.patch.startMs ?? existing.startMs
    const end = input.patch.endMs ?? existing.endMs
    validateTime(start, end, updated.allDay)
  }

  await deps.repository.updateEvent(input.userId, input.eventId, updated, input.baseUpdatedAtMs)
  return updated
}

/**
 * Delete a calendar event
 *
 * Soft-deletes calendar events by marking them as deleted rather than
 * physically removing them. This enables sync tracking and undelete capabilities.
 *
 * Business Logic:
 * 1. Validates event exists and isn't already deleted
 * 2. Checks write permissions for the event
 * 3. Marks event as deleted (soft delete)
 * 4. Queues deletion for sync to external providers
 * 5. Uses base revision for conflict resolution
 *
 * Why Soft Delete:
 * - Enables multi-device sync of deletions
 * - Prevents deleted events from reappearing
 * - Maintains audit trail
 * - Required for Google Calendar API compatibility
 *
 * @param deps - Dependencies including repository access
 * @param input - Delete parameters with base revision for conflict detection
 */
export async function deleteEvent(deps: EventUsecaseDeps, input: DeleteEventInput): Promise<void> {
  // Validate event exists and can be deleted
  const existing = await deps.repository.getById(input.userId, input.eventId)
  if (!existing || isDeleted(existing)) {
    throw new Error('Event not found or already deleted')
  }

  // Check permissions before allowing deletion
  const { canWrite, reason } = canWriteBack(existing)
  if (!canWrite) {
    throw new Error(`Cannot delete event: ${reason}`)
  }

  // Perform soft delete with conflict resolution
  await deps.repository.deleteEvent(input.userId, input.eventId, input.baseUpdatedAtMs)
}

