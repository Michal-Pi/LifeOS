/**
 * Core domain models for the LifeOS Calendar System
 *
 * This file defines the canonical data structures that represent calendar events,
 * accounts, permissions, and sync state. These models are the source of truth
 * for the entire calendar system and are designed to be provider-agnostic.
 *
 * Key Design Principles:
 * - Provider neutrality: Models work with Google, Microsoft, iCloud, or local events
 * - Permission-aware: All operations consider user permissions and access roles
 * - Conflict resolution: Built-in support for multi-device sync conflicts
 * - Type safety: Comprehensive TypeScript types for all entities
 * - Backwards compatibility: Versioned schemas with migration support
 */

export type Provider = 'google' | 'microsoft' | 'icloud' | 'local'

/**
 * Synchronization state for calendar events
 *
 * Tracks the relationship between local event state and external provider state.
 * This enables the offline-first architecture and conflict resolution.
 *
 * States:
 * - 'synced': Event is synchronized with all providers
 * - 'pending_writeback': Local changes exist but haven't been pushed to provider yet
 * - 'error': Last sync attempt failed (retry will be attempted)
 * - 'conflict': Conflicting changes detected between local and provider
 * - 'read_only_provider': Event exists but cannot be modified (e.g., recurring series managed by provider)
 */
export type SyncState =
  | 'synced' // In sync with provider
  | 'pending_writeback' // Local changes waiting to be written to provider
  | 'error' // Writeback failed
  | 'conflict' // Conflict detected between local and provider
  | 'read_only_provider' // Event cannot be written back (e.g., recurring)

export interface CalendarAccount {
  accountId: string
  provider: Provider
  email?: string
  status: 'connected' | 'needs_attention' | 'disconnected'
  createdAt: string
  updatedAt: string
  lastSyncAt?: string
  lastSuccessAt?: string
  nextSyncAt?: string
  error?: { code: string; message: string }
}

export interface CalendarAccountStatus {
  provider?: Provider
  status?: 'connected' | 'needs_attention' | 'disconnected'
  lastSuccessAt?: string
  updatedAt?: string
}

export interface CalendarListItem {
  calendarId: string
  accountId: string
  provider: Provider
  providerCalendarId: string
  name: string
  color?: string
  accessRole?: string
  canWrite?: boolean
  visible: boolean
  updatedAt: string
}

// ==================== Calendar Permissions (Phase 2.6) ====================

/**
 * Access role for a calendar (matches Google Calendar API)
 */
export type CalendarAccessRole = 'owner' | 'writer' | 'reader' | 'freeBusyReader' | 'unknown'

/**
 * Owner information for a calendar
 */
export interface CalendarOwner {
  email?: string
  self?: boolean // True if the current user owns this calendar
}

/**
 * Provider metadata for a calendar
 */
export interface CalendarProviderMeta {
  provider: Provider
  providerCalendarId: string
  accountId: string
}

/**
 * Canonical calendar with full permission support
 * Stored at /users/{uid}/calendars/{calendarId}
 */
export interface CanonicalCalendar {
  calendarId: string // Canonical ID
  name: string // Display name
  description?: string

  // Permissions (Phase 2.6)
  owner?: CalendarOwner
  accessRole: CalendarAccessRole
  canWrite: boolean // Derived from accessRole; cached for quick checks

  // Calendar metadata
  isPrimary?: boolean // True if this is the user's primary calendar
  color?: string // Background color (hex)
  foregroundColor?: string // Text color (hex)
  timeZone?: string

  // Provider reference
  providerMeta: CalendarProviderMeta

  // Sync state
  visible: boolean // Whether to show in UI
  selected?: boolean // Whether currently selected for viewing
  createdAt: string
  updatedAt: string

  // LifeOS sync settings (optional, managed by UI)
  syncEnabled?: boolean
  writebackEnabled?: boolean
  writebackVisibility?: 'default' | 'private'
  lifeosColor?: string
}

/**
 * Reference to a provider event
 */
export interface ExternalRef {
  provider: Provider
  accountId: string
  providerCalendarId: string
  providerEventId: string
  etag?: string
  recurringEventId?: string
}

/**
 * Map of external references keyed by provider:accountId:calendarId
 */
export type ExternalRefsMap = Record<string, ExternalRef>

// ==================== Attendee Types (Phase 2.4) ====================

/**
 * Canonical response status for attendees
 */
export type CanonicalResponseStatus =
  | 'needsAction'
  | 'accepted'
  | 'tentative'
  | 'declined'
  | 'unknown'

/**
 * Canonical attendee with full RSVP support
 */
export interface CanonicalAttendee {
  email?: string
  displayName?: string
  self?: boolean // True if this is the current user
  organizer?: boolean // True if this attendee is the organizer
  optional?: boolean // True if attendance is optional
  resource?: boolean // True if this is a room/resource
  responseStatus: CanonicalResponseStatus
  comment?: string // Attendee's response comment
  additionalGuests?: number // Number of additional guests
}

/**
 * Canonical organizer (who created/owns the event)
 */
export interface CanonicalOrganizer {
  email?: string
  displayName?: string
  self?: boolean // True if current user is the organizer
}

/**
 * Canonical creator (who created the event in the calendar)
 */
export interface CanonicalCreator {
  email?: string
  displayName?: string
  self?: boolean // True if current user created the event
}

/**
 * User's role in the event
 */
export type CanonicalEventRole = 'organizer' | 'attendee' | 'unknown'

/**
 * RSVP capabilities and status for the current user
 */
export interface CanonicalRSVP {
  canRespond: boolean // Whether user can respond
  status?: CanonicalResponseStatus // Current user's response status
}

/**
 * Provider-specific capabilities for this event
 */
export interface ProviderCapabilities {
  canInvite?: boolean // Can add attendees
  canRespond?: boolean // Can RSVP
  canUpdate?: boolean // Can update event details
  canCancel?: boolean // Can cancel the event
}

// ==================== Alerts (Phase 2.5) ====================

/**
 * Alert delivery method
 * Currently only in_app_banner is supported; future: "push", "email"
 */
export type CanonicalAlertMethod = 'in_app_banner'

/**
 * A single alert configuration for an event
 */
export interface CanonicalAlert {
  method: CanonicalAlertMethod
  minutesBefore: number // e.g., 10, 5, 0 (at time of event)
  enabled: boolean
}

/**
 * Alert dismissal state for an event
 * Tracks which alerts have been dismissed to avoid re-showing
 */
export interface AlertDismissalState {
  /** Timestamp until which alerts are dismissed (usually startMs) */
  dismissedUntilMs?: number
  /** When the dismissal happened */
  dismissedAtMs?: number
}

/**
 * Legacy recurrence fields (for backwards compatibility)
 * @deprecated Use recurrenceV2 for new code
 */
export interface LegacyRecurrence {
  recurringEventId?: string
  recurrenceRules?: string[]
  originalStartTime?: string
}

// Re-export recurrence types from recurrence module
export type {
  CanonicalRecurrence,
  CanonicalRecurrenceRule,
  CanonicalEventOverride,
  RecurrenceSplit,
  RecurrenceFrequency,
  Weekday,
  WeekStart,
  RecurrenceInstance,
  GenerateInstancesOptions,
  GenerateInstancesResult,
} from './recurrence/types'

export interface CanonicalReminder {
  method?: string
  minutesBefore?: number
}

/**
 * Writeback error details
 */
export interface WritebackError {
  code?: string
  message: string
  atMs: number
}

import type { CanonicalRecurrence as RecurrenceV2 } from './recurrence/types'

/**
 * Canonical Calendar Event - The Source of Truth for LifeOS Calendar
 *
 * This is the core domain entity representing a calendar event in the LifeOS system.
 * Every calendar event, regardless of its source (Google Calendar, local creation,
 * Microsoft Outlook, etc.), is normalized into this canonical format.
 *
 * Key Characteristics:
 * - Provider-agnostic: Works with any calendar provider
 * - Permission-aware: Includes role-based access control
 * - Conflict-resistant: Supports multi-device synchronization
 * - Versioned: Schema versioning for backwards compatibility
 * - Comprehensive: Includes attendees, alerts, recurrence, and sync state
 *
 * Event Lifecycle:
 * 1. Created locally or synced from provider
 * 2. Normalized to canonical format
 * 3. Stored with sync metadata
 * 4. Changes tracked for conflict resolution
 * 5. Synced bidirectionally with providers
 */
export interface CanonicalCalendarEvent {
  canonicalEventId: string
  schemaVersion: number
  normalizationVersion: number

  // Provider references
  providerRef: ExternalRef // Primary provider reference (legacy, kept for compatibility)
  primaryProvider?: Provider // Which provider is authoritative
  externalRefs?: ExternalRefsMap // All provider references keyed by provider:accountId:calendarId

  iCalUID?: string
  createdAt: string
  updatedAt: string
  createdAtMs: number
  updatedAtMs: number

  // Sync metadata (Phase 2.2)
  canonicalUpdatedAtMs: number // When canonical was last updated locally
  providerUpdatedAtMs?: number // When provider last updated this event
  lastWritebackAtMs?: number // When we last wrote back to provider
  syncState: SyncState
  writebackError?: WritebackError
  writebackBlockedReason?: string // e.g., "recurring_event_not_supported"

  // Conflict resolution (Phase 2.7)
  rev?: number // Monotonically increasing revision number (default 0)
  updatedByDeviceId?: string // Device ID that made the last update (for tie-breaking)

  // Operation provenance
  source: { type: 'provider' | 'local'; description?: string }

  // Permission cache (Phase 2.6)
  canWrite?: boolean // Cached permission; prefer derived via calendar

  // Event fields
  status?: string
  visibility?: string
  transparency?: string
  title?: string
  description?: string
  location?: string
  hangoutLink?: string
  conferencing?: string
  startMs: number
  endMs: number
  startIso: string
  endIso: string
  timezone?: string
  allDay?: boolean
  occursOn: string[]

  // Attendee fields (Phase 2.4)
  organizer?: CanonicalOrganizer
  creator?: CanonicalCreator
  attendees?: CanonicalAttendee[]
  selfAttendee?: CanonicalAttendee // Current user's attendee entry (derived/cached)
  role?: CanonicalEventRole // User's role: organizer, attendee, unknown
  rsvp?: CanonicalRSVP // RSVP capabilities for current user
  providerCapabilities?: ProviderCapabilities // What actions are allowed

  // Recurrence (Phase 2.3)
  recurrence?: LegacyRecurrence // Legacy format (kept for backwards compat)
  recurrenceV2?: RecurrenceV2 // New canonical recurrence format
  isRecurringSeries?: boolean // True if this is a master recurring series
  isRecurrenceInstance?: boolean // True if this is a provider instance (exception)
  seriesId?: string // If instance, points to master series
  originalStartTimeMs?: number // For instances: original occurrence time

  reminders?: CanonicalReminder[]
  attachments?: Array<{ title?: string; url?: string }>
  calendarId?: string // Canonical calendar ID (Phase 2.6: used for permission lookup)
  raw?: unknown
  deletedAtMs?: number

  // Alerts (Phase 2.5)
  alerts?: CanonicalAlert[] // Alert configurations for this event
  alertsUpdatedAtMs?: number // When alerts were last modified
  alertDismissal?: AlertDismissalState // Dismissal state (syncs across devices)
}

export function isDeleted(event: CanonicalCalendarEvent): boolean {
  return typeof event.deletedAtMs === 'number' && event.deletedAtMs > 0
}

/**
 * Check if event is a recurring series master
 */
export function isRecurringSeries(event: CanonicalCalendarEvent): boolean {
  return Boolean(
    event.isRecurringSeries || event.recurrenceV2?.rule || event.recurrence?.recurrenceRules?.length
  )
}

/**
 * Check if event is a recurrence instance (exception from provider)
 */
export function isRecurrenceInstance(event: CanonicalCalendarEvent): boolean {
  return Boolean(
    event.isRecurrenceInstance ||
    event.recurrence?.recurringEventId ||
    event.providerRef.recurringEventId
  )
}

/**
 * Get the series ID for an event (if recurring)
 */
export function getSeriesId(event: CanonicalCalendarEvent): string | null {
  if (event.isRecurringSeries) {
    return event.canonicalEventId
  }
  if (event.seriesId) {
    return event.seriesId
  }
  if (event.recurrence?.recurringEventId) {
    return event.recurrence.recurringEventId
  }
  if (event.providerRef.recurringEventId) {
    return event.providerRef.recurringEventId
  }
  return null
}

export function computeOccursOn(start: string, end: string, capDays = 60): string[] {
  const days: string[] = []
  const startDate = new Date(start)
  const endDate = new Date(end)
  let cursor = new Date(startDate)
  let iterations = 0
  while (cursor <= endDate && iterations < capDays) {
    days.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    iterations += 1
  }
  return days
}

// ==================== Attendee Helpers (Phase 2.4) ====================

/**
 * Determine user's role in an event
 */
export function determineEventRole(event: CanonicalCalendarEvent): CanonicalEventRole {
  // Check if organizer.self is true
  if (event.organizer?.self === true) {
    return 'organizer'
  }

  // Check if any attendee has self === true
  if (event.attendees?.some((a) => a.self === true)) {
    return 'attendee'
  }

  // If creator.self is true and no explicit organizer, consider as organizer
  if (event.creator?.self === true && !event.organizer) {
    return 'organizer'
  }

  return 'unknown'
}

/**
 * Find the current user's attendee entry
 */
export function findSelfAttendee(event: CanonicalCalendarEvent): CanonicalAttendee | undefined {
  return event.attendees?.find((a) => a.self === true)
}

/**
 * Derive RSVP capabilities for the current user
 */
export function deriveRSVP(event: CanonicalCalendarEvent): CanonicalRSVP {
  const role = event.role ?? determineEventRole(event)
  const selfAttendee = event.selfAttendee ?? findSelfAttendee(event)

  // Can respond if user is an attendee (not organizer) and event has attendees
  const canRespond = role === 'attendee' && selfAttendee != null

  return {
    canRespond,
    status: selfAttendee?.responseStatus,
  }
}

/**
 * Derive provider capabilities based on event data
 */
export function deriveProviderCapabilities(
  event: CanonicalCalendarEvent,
  calendarCanWrite = true
): ProviderCapabilities {
  const role = event.role ?? determineEventRole(event)
  const isOrganizer = role === 'organizer'
  const isAttendee = role === 'attendee'
  const isReadOnly = event.providerCapabilities?.canUpdate === false || !calendarCanWrite

  return {
    canInvite: isOrganizer && !isReadOnly,
    canRespond: isAttendee,
    canUpdate: isOrganizer && !isReadOnly,
    canCancel: isOrganizer && !isReadOnly,
  }
}

/**
 * Check if an event should block time in busy/free calculation
 * Declined events don't block time
 */
export function isEventBusy(event: CanonicalCalendarEvent): boolean {
  // If user declined, event doesn't block time
  const selfAttendee = event.selfAttendee ?? findSelfAttendee(event)
  if (selfAttendee?.responseStatus === 'declined') {
    return false
  }

  // If event is marked as transparent (free), it doesn't block
  if (event.transparency === 'transparent') {
    return false
  }

  // Default: event blocks time
  return true
}

/**
 * Normalize a response status string to canonical format
 */
export function normalizeResponseStatus(status?: string): CanonicalResponseStatus {
  if (!status) return 'unknown'

  const normalized = status.toLowerCase()
  switch (normalized) {
    case 'needsaction':
    case 'needs_action':
      return 'needsAction'
    case 'accepted':
      return 'accepted'
    case 'tentative':
      return 'tentative'
    case 'declined':
      return 'declined'
    default:
      return 'unknown'
  }
}

/**
 * Get display label for response status
 */
export function getResponseStatusLabel(status: CanonicalResponseStatus): string {
  switch (status) {
    case 'needsAction':
      return 'Needs action'
    case 'accepted':
      return 'Accepted'
    case 'tentative':
      return 'Maybe'
    case 'declined':
      return 'Declined'
    case 'unknown':
    default:
      return 'Unknown'
  }
}

/**
 * Get attendee count (excluding resources)
 */
export function getAttendeeCount(event: CanonicalCalendarEvent): number {
  return event.attendees?.filter((a) => !a.resource).length ?? 0
}

// ==================== Convenience Aliases ====================

/**
 * Alias for determineEventRole - returns user's role in the event
 */
export function getEventRole(event: CanonicalCalendarEvent): CanonicalEventRole {
  return event.role ?? determineEventRole(event)
}

/**
 * Alias for findSelfAttendee - returns the current user's attendee entry
 */
export function getSelfAttendee(event: CanonicalCalendarEvent): CanonicalAttendee | undefined {
  return event.selfAttendee ?? findSelfAttendee(event)
}

/**
 * Check if user can respond to this event (RSVP)
 */
export function canRespond(event: CanonicalCalendarEvent): boolean {
  const rsvp = event.rsvp ?? deriveRSVP(event)
  return rsvp.canRespond
}

/**
 * Check if user can update this event
 */
export function canUpdate(event: CanonicalCalendarEvent): boolean {
  const caps = event.providerCapabilities ?? deriveProviderCapabilities(event)
  return caps.canUpdate ?? false
}

/**
 * Check if user can cancel this event
 */
export function canCancel(event: CanonicalCalendarEvent): boolean {
  const caps = event.providerCapabilities ?? deriveProviderCapabilities(event)
  return caps.canCancel ?? false
}

/**
 * Check if user can invite attendees to this event
 */
export function canInvite(event: CanonicalCalendarEvent): boolean {
  const caps = event.providerCapabilities ?? deriveProviderCapabilities(event)
  return caps.canInvite ?? false
}

// ==================== Alert Helpers (Phase 2.5) ====================

/**
 * Get the primary (first enabled) alert for an event
 */
export function getPrimaryAlert(event: CanonicalCalendarEvent): CanonicalAlert | null {
  if (!event.alerts || event.alerts.length === 0) {
    return null
  }
  // Return first enabled alert, or first alert if none enabled
  const enabled = event.alerts.find((a) => a.enabled)
  return enabled ?? event.alerts[0] ?? null
}

/**
 * Compute when an alert should fire for an event
 *
 * Returns null if:
 * - Event is an all-day event (alerts not supported for all-day in v1)
 * - Event has no valid start time
 * - Alert is disabled
 *
 * Note: All-day events are not supported for alerts in v1.
 * This is because all-day events have ambiguous start times
 * (midnight in what timezone?). Future versions may support
 * configuring a specific time for all-day event alerts.
 */
export function computeAlertFireTimeMs(
  event: CanonicalCalendarEvent,
  alert: CanonicalAlert
): number | null {
  // Don't fire for disabled alerts
  if (!alert.enabled) {
    return null
  }

  // All-day events: alerts not supported in v1
  // The start time is ambiguous (midnight in which timezone?)
  if (event.allDay) {
    return null
  }

  // Must have valid start time
  if (!event.startMs || event.startMs <= 0) {
    return null
  }

  // Compute fire time: startMs minus minutesBefore
  const fireTimeMs = event.startMs - alert.minutesBefore * 60 * 1000
  return fireTimeMs
}

/**
 * Check if an alert has been dismissed for an event
 *
 * An alert is considered dismissed if:
 * - dismissedUntilMs is set and now < dismissedUntilMs
 * - This prevents the alert from re-appearing until the event starts
 */
export function isAlertDismissed(event: CanonicalCalendarEvent, nowMs: number): boolean {
  if (!event.alertDismissal) {
    return false
  }

  const { dismissedUntilMs } = event.alertDismissal

  // If dismissedUntilMs is set and we're before that time, alert is dismissed
  if (dismissedUntilMs && nowMs < dismissedUntilMs) {
    return true
  }

  return false
}

/**
 * Check if an alert should fire for an event at the current time
 *
 * An alert should fire if:
 * - Event is not deleted/cancelled
 * - Event is not an all-day event (not supported in v1)
 * - Alert is enabled
 * - Fire time has passed but event hasn't started yet
 * - Alert hasn't been dismissed
 */
export function shouldAlertFire(
  event: CanonicalCalendarEvent,
  alert: CanonicalAlert,
  nowMs: number
): boolean {
  // Don't fire for deleted/cancelled events
  if (isDeleted(event) || event.status === 'cancelled') {
    return false
  }

  // Compute fire time
  const fireTimeMs = computeAlertFireTimeMs(event, alert)
  if (fireTimeMs === null) {
    return false
  }

  // Check if we're in the fire window (after fire time, before start)
  if (nowMs < fireTimeMs) {
    return false // Too early
  }

  if (nowMs >= event.startMs) {
    return false // Event already started
  }

  // Check dismissal
  if (isAlertDismissed(event, nowMs)) {
    return false
  }

  return true
}

/**
 * Create dismissal state for an alert
 * Dismisses until event start time
 */
export function createAlertDismissal(event: CanonicalCalendarEvent): AlertDismissalState {
  return {
    dismissedUntilMs: event.startMs,
    dismissedAtMs: Date.now(),
  }
}

/**
 * Preset alert options for UI
 */
export const ALERT_PRESETS = [
  { label: 'None', minutesBefore: -1 }, // -1 means no alert
  { label: 'At time of event', minutesBefore: 0 },
  { label: '5 minutes before', minutesBefore: 5 },
  { label: '10 minutes before', minutesBefore: 10 },
  { label: '15 minutes before', minutesBefore: 15 },
  { label: '30 minutes before', minutesBefore: 30 },
  { label: '1 hour before', minutesBefore: 60 },
  { label: 'Custom', minutesBefore: -2 }, // -2 means custom input
] as const

/**
 * Get a human-readable description of an alert
 */
export function describeAlert(alert: CanonicalAlert | null): string {
  if (!alert || !alert.enabled) {
    return 'No alert'
  }

  if (alert.minutesBefore === 0) {
    return 'At time of event'
  }

  if (alert.minutesBefore < 60) {
    return `${alert.minutesBefore} minute${alert.minutesBefore === 1 ? '' : 's'} before`
  }

  const hours = alert.minutesBefore / 60
  if (Number.isInteger(hours)) {
    return `${hours} hour${hours === 1 ? '' : 's'} before`
  }

  return `${alert.minutesBefore} minutes before`
}

// ==================== Calendar Permission Helpers (Phase 2.6) ====================

/**
 * Permission System for Calendar Operations
 *
 * LifeOS implements a comprehensive permission system that respects calendar provider
 * access controls while providing a unified interface. Permissions are derived from:
 *
 * 1. Calendar Access Role: Owner/Writer/Reader/FreeBusyReader
 * 2. Event Role: Organizer vs Attendee
 * 3. Provider Capabilities: What operations the provider supports
 *
 * This ensures users can only perform actions they're authorized to do,
 * regardless of which calendar provider the event comes from.
 */

/**
 * Determine if a calendar allows write operations based on access role
 *
 * Maps provider-specific access roles to a boolean write permission.
 * This is used to enforce calendar-level permissions before event-specific checks.
 *
 * @param accessRole - Access role from provider (owner/writer/reader/freeBusyReader)
 * @returns true if user can create/edit/delete events in this calendar
 */
export function deriveCalendarCanWrite(accessRole?: CalendarAccessRole | string): boolean {
  if (!accessRole) {
    return false
  }

  // Owner and writer roles can write
  return accessRole === 'owner' || accessRole === 'writer'
}

/**
 * Normalize an access role string to the canonical type
 */
export function normalizeAccessRole(role?: string): CalendarAccessRole {
  if (!role) return 'unknown'

  const normalized = role.toLowerCase()
  switch (normalized) {
    case 'owner':
      return 'owner'
    case 'writer':
      return 'writer'
    case 'reader':
      return 'reader'
    case 'freebusyreader':
      return 'freeBusyReader'
    default:
      return 'unknown'
  }
}

/**
 * Map of calendars by their ID for quick lookup
 */
export type CalendarsById = Map<string, CanonicalCalendar>

/**
 * Derive whether an event can be written based on:
 * 1. The event's cached canWrite field (if set)
 * 2. The calendar's canWrite field
 * 3. The event's role (organizer can write, attendee cannot unless RSVP)
 *
 * @param event - The canonical event
 * @param calendarsById - Map of calendars for lookup
 * @returns true if the user can write to this event
 */
export function deriveEventCanWrite(
  event: CanonicalCalendarEvent,
  calendarsById?: CalendarsById
): boolean {
  // If event has explicit canWrite, use it
  if (typeof event.canWrite === 'boolean') {
    return event.canWrite
  }

  // Look up calendar
  const calendarId = event.calendarId ?? event.providerRef.providerCalendarId
  const calendar = calendarsById?.get(calendarId)

  // If calendar is read-only, event is read-only
  if (calendar && !calendar.canWrite) {
    return false
  }

  // Check event-level permissions (role-based)
  const role = getEventRole(event)

  // Organizers can write
  if (role === 'organizer') {
    return true
  }

  // Attendees can only RSVP (not full write)
  // Return true here; specific actions (edit vs RSVP) checked elsewhere
  if (role === 'attendee') {
    return false // Attendees cannot edit the event itself
  }

  // Unknown role with writable calendar: assume can write
  // (e.g., single-person events on own calendar)
  if (calendar?.canWrite) {
    return true
  }

  // Default to calendar's canWrite if available
  return calendar?.canWrite ?? false
}

/**
 * Check if an event can be edited (full edit, not RSVP)
 *
 * @param event - The canonical event
 * @param calendarsById - Map of calendars for lookup
 * @returns true if the user can edit this event
 */
export function canEditEvent(
  event: CanonicalCalendarEvent,
  calendarsById?: CalendarsById
): boolean {
  // Calendar must be writable
  const calendarId = event.calendarId ?? event.providerRef.providerCalendarId
  const calendar = calendarsById?.get(calendarId)

  if (calendar && !calendar.canWrite) {
    return false
  }

  // User must be organizer or the only person on the event
  const role = getEventRole(event)

  if (role === 'organizer') {
    return true
  }

  // If no attendees and on writable calendar, can edit
  if (!event.attendees?.length && (calendar?.canWrite ?? true)) {
    return true
  }

  return false
}

/**
 * Check if an event can be deleted
 *
 * @param event - The canonical event
 * @param calendarsById - Map of calendars for lookup
 * @returns true if the user can delete this event
 */
export function canDeleteEvent(
  event: CanonicalCalendarEvent,
  calendarsById?: CalendarsById
): boolean {
  // Same logic as canEditEvent for deletion
  return canEditEvent(event, calendarsById)
}

/**
 * Check if user can RSVP to an event
 * (Different from editing - attendees can RSVP)
 *
 * @param event - The canonical event
 * @returns true if the user can RSVP to this event
 */
export function canRSVPToEvent(event: CanonicalCalendarEvent): boolean {
  const role = getEventRole(event)
  return role === 'attendee' && canRespond(event)
}

/**
 * Check if user can invite others to an event
 *
 * @param event - The canonical event
 * @param calendarsById - Map of calendars for lookup
 * @returns true if the user can invite others
 */
export function canInviteToEvent(
  event: CanonicalCalendarEvent,
  calendarsById?: CalendarsById
): boolean {
  // Must be organizer and calendar must be writable
  const role = getEventRole(event)
  if (role !== 'organizer') {
    return false
  }

  const calendarId = event.calendarId ?? event.providerRef.providerCalendarId
  const calendar = calendarsById?.get(calendarId)

  return calendar?.canWrite ?? true
}

/**
 * Get a human-readable description of the permission status
 */
export function describePermission(canWrite: boolean): string {
  return canWrite ? 'Can edit' : 'View only'
}

// ==================== Conflict Resolution System (Phase 2.7) ====================

/**
 * Multi-Device Synchronization and Conflict Resolution
 *
 * LifeOS supports seamless synchronization across multiple devices and users.
 * When conflicts occur (e.g., same event edited on two devices simultaneously),
 * the system uses deterministic conflict resolution to ensure all devices converge
 * to the same state without data loss.
 *
 * Conflict Resolution Strategy:
 * 1. Revision Guard: Changes must be based on current server state
 * 2. Last-Write-Wins: Most recent change wins
 * 3. Device ID Tiebreaker: Consistent resolution when timestamps match
 * 4. Atomic Updates: All changes applied transactionally
 *
 * Benefits:
 * - No manual conflict resolution required
 * - Deterministic outcomes across all devices
 * - Preserves user intent while preventing data corruption
 * - Works offline and syncs when connectivity returns
 */

/**
 * Result of a conflict resolution attempt
 *
 * Contains the outcome of trying to apply an incoming update, including
 * whether a conflict was detected and which version won.
 */
export interface ConflictResolutionResult {
  /** Whether a conflict was detected */
  hasConflict: boolean
  /** The winning event after resolution */
  winner: CanonicalCalendarEvent
  /** Reason for the resolution outcome */
  reason:
    | 'no_conflict'
    | 'incoming_wins_timestamp'
    | 'server_wins_timestamp'
    | 'incoming_wins_deviceid'
    | 'server_wins_deviceid'
  /** New revision number to use */
  newRev: number
}

/**
 * Incoming update to be applied
 */
export interface IncomingUpdate {
  /** Base revision the client was working from */
  baseRev: number
  /** The updated event data */
  event: Partial<CanonicalCalendarEvent> & { canonicalEventId: string }
  /** When the update was made */
  updatedAtMs: number
  /** Device that made the update */
  deviceId: string
}

/**
 * Core Conflict Resolution Algorithm
 *
 * This function implements the deterministic conflict resolution that ensures
 * all devices converge to the same state when multiple users edit the same event.
 *
 * Algorithm Flow:
 * ┌─────────────────┐
 * │ Check Revision  │ ← Is baseRev == server.rev?
 * └─────────────────┘
 *         │
 *         ├─ Yes: No conflict, apply incoming changes
 *         │
 *         └─ No: Conflict detected
 *              │
 *              ├─ Compare timestamps (higher wins)
 *              │
 *              ├─ If equal: Compare device IDs (lexicographically lower wins)
 *              │
 *              └─ Apply winning changes, increment revision
 *
 * Why This Works:
 * - Revision guard prevents stale updates from overwriting recent changes
 * - Timestamp comparison respects user intent (last edit wins)
 * - Device ID tiebreaker ensures deterministic resolution
 * - All devices will compute the same winner for the same inputs
 *
 * @param server - Current server state of the event
 * @param incoming - Incoming update from client
 * @returns Resolution result with winner and new revision
 */
export function resolveConflict(
  server: CanonicalCalendarEvent,
  incoming: IncomingUpdate
): ConflictResolutionResult {
  const serverRev = server.rev ?? 0
  const baseRev = incoming.baseRev ?? 0

  // No conflict: base revision matches server
  if (baseRev === serverRev) {
    const merged = applyPatch(server, incoming)
    return {
      hasConflict: false,
      winner: merged,
      reason: 'no_conflict',
      newRev: serverRev + 1,
    }
  }

  // Conflict detected: determine winner
  const serverUpdatedAtMs = server.canonicalUpdatedAtMs ?? server.updatedAtMs ?? 0
  const incomingUpdatedAtMs = incoming.updatedAtMs ?? 0

  // Compare timestamps
  if (incomingUpdatedAtMs > serverUpdatedAtMs) {
    const merged = applyPatch(server, incoming)
    return {
      hasConflict: true,
      winner: merged,
      reason: 'incoming_wins_timestamp',
      newRev: serverRev + 1,
    }
  }

  if (serverUpdatedAtMs > incomingUpdatedAtMs) {
    return {
      hasConflict: true,
      winner: server,
      reason: 'server_wins_timestamp',
      newRev: serverRev, // Server wins, no rev increment needed
    }
  }

  // Timestamps equal: tie-break by deviceId (lexicographically lower wins)
  const serverDeviceId = server.updatedByDeviceId ?? ''
  const incomingDeviceId = incoming.deviceId ?? ''

  if (incomingDeviceId < serverDeviceId) {
    const merged = applyPatch(server, incoming)
    return {
      hasConflict: true,
      winner: merged,
      reason: 'incoming_wins_deviceid',
      newRev: serverRev + 1,
    }
  }

  // Server wins by deviceId or equal deviceId
  return {
    hasConflict: true,
    winner: server,
    reason: 'server_wins_deviceid',
    newRev: serverRev,
  }
}

/**
 * Apply a partial update to an event
 */
function applyPatch(
  server: CanonicalCalendarEvent,
  incoming: IncomingUpdate
): CanonicalCalendarEvent {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  return {
    ...server,
    ...incoming.event,
    canonicalEventId: server.canonicalEventId, // Never change ID
    providerRef: server.providerRef, // Keep provider ref
    externalRefs: server.externalRefs, // Keep external refs
    createdAt: server.createdAt, // Keep original creation time
    createdAtMs: server.createdAtMs,
    updatedAt: nowIso,
    updatedAtMs: now,
    canonicalUpdatedAtMs: incoming.updatedAtMs,
    updatedByDeviceId: incoming.deviceId,
    rev: (server.rev ?? 0) + 1,
  }
}

/**
 * Check if an incoming update would cause a conflict
 */
export function wouldConflict(server: CanonicalCalendarEvent, baseRev: number): boolean {
  const serverRev = server.rev ?? 0
  return baseRev !== serverRev
}

/**
 * Generate a stable device ID for the current device
 * Uses localStorage to persist across sessions
 */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    // Server-side or SSR: generate ephemeral ID
    return `server-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  const key = 'lifeos-device-id'
  let deviceId = localStorage.getItem(key)

  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, deviceId)
  }

  return deviceId
}

/**
 * Merge conflict status type for UI display
 */
export type ConflictStatus =
  | 'none' // No conflict
  | 'local_pending' // Local changes waiting to sync
  | 'conflict' // Conflict detected, needs resolution
  | 'resolved' // Conflict was resolved

/**
 * Get the conflict status for an event
 */
export function getConflictStatus(
  event: CanonicalCalendarEvent,
  hasPendingLocalOp: boolean
): ConflictStatus {
  if (event.syncState === 'conflict') {
    return 'conflict'
  }

  if (hasPendingLocalOp) {
    return 'local_pending'
  }

  return 'none'
}
