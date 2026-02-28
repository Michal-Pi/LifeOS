/**
 * @fileoverview Scheduling Link domain types
 *
 * Firestore paths:
 *   /users/{userId}/schedulingLinks/{linkId}
 *   /users/{userId}/schedulingLinks/{linkId}/bookings/{bookingId}
 *   /schedulingLinkSlugs/{slug}  (root-level slug-to-user lookup)
 */

export interface TimeWindow {
  /** "HH:mm" 24-hour format, e.g. "09:00" */
  start: string
  /** "HH:mm" 24-hour format, e.g. "17:00" */
  end: string
}

export interface WeeklyAvailability {
  mon: TimeWindow[]
  tue: TimeWindow[]
  wed: TimeWindow[]
  thu: TimeWindow[]
  fri: TimeWindow[]
  sat: TimeWindow[]
  sun: TimeWindow[]
}

export type DayKey = keyof WeeklyAvailability

export interface SchedulingLinkBranding {
  accentColor?: string
  welcomeMessage?: string
}

export interface SchedulingLink {
  id: string
  /** URL-friendly unique identifier, e.g. "peter-30min" */
  slug: string
  /** Display title, e.g. "30-Minute Chat" */
  title: string
  description?: string
  /** Available durations in minutes — guest picks one */
  durations: number[]
  /** Pre-selected duration */
  defaultDuration: number
  /** Google Calendar ID to check availability and create events */
  calendarId: string
  /** Google account ID for OAuth tokens */
  accountId: string
  /** Owner's IANA timezone, e.g. "America/New_York" */
  timezone: string
  availability: WeeklyAvailability
  /** Buffer in minutes before/after meetings (default 0) */
  bufferMinutes: number
  /** How far ahead guests can book in days (default 30) */
  maxDaysAhead: number
  /** Default location or conferencing info */
  location?: string
  /** Auto-add Google Meet */
  addConferencing: boolean
  /** Booking page customization */
  branding?: SchedulingLinkBranding
  active: boolean
  /** ISO 8601 */
  createdAt: string
  /** ISO 8601 */
  updatedAt: string
}

export interface Booking {
  id: string
  linkId: string
  guestName: string
  guestEmail: string
  guestNotes?: string
  /** ISO 8601 */
  startTime: string
  /** ISO 8601 */
  endTime: string
  /** Duration in minutes */
  duration: number
  /** Guest's IANA timezone */
  timezone: string
  /** Google Calendar event ID after creation */
  googleEventId?: string
  status: 'confirmed' | 'cancelled'
  /** ISO 8601 */
  createdAt: string
}

/** Stored at /schedulingLinkSlugs/{slug} for O(1) slug-to-user lookup */
export interface SlugLookup {
  userId: string
  linkId: string
}

/** Sanitized link data returned to the public booking page */
export interface PublicLinkData {
  title: string
  description?: string
  durations: number[]
  defaultDuration: number
  timezone: string
  maxDaysAhead: number
  location?: string
  branding?: SchedulingLinkBranding
  availability: WeeklyAvailability
}

export interface TimeSlot {
  startMs: number
  endMs: number
}
