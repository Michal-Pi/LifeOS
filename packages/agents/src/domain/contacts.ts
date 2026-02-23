/**
 * Contact Domain Models (Inner Circle CRM)
 *
 * Dunbar-inspired personal CRM for organizing and nurturing relationships.
 * Aggregates contacts from Gmail, LinkedIn, WhatsApp, Slack, Telegram,
 * Calendar, and Google Contacts with cross-channel identity resolution.
 */

import type { Id } from '@lifeos/core'
import type { SenderPersonaId, MessageSource } from './mailbox'

// ----- IDs -----

export type ContactId = Id<'contact'>
export type InteractionId = Id<'interaction'>

// ----- Enums -----

/** Dunbar circle: 0 = Core (~5), 1 = Inner (~15), 2 = Active (~50), 3 = Extended (~150), 4 = Acquaintance */
export type DunbarCircle = 0 | 1 | 2 | 3 | 4

/** How this contact entered the system */
export type ContactSource = MessageSource | 'google_contacts' | 'manual' | 'calendar'

/** Type of interaction recorded */
export type InteractionType = 'email' | 'meeting' | 'call' | 'message' | 'note' | 'social'

/** Follow-up urgency relative to cadence */
export type FollowUpStatus = 'overdue' | 'due' | 'upcoming' | 'ok'

// ----- Contact Identifiers (cross-channel identity resolution) -----

export interface ContactIdentifiers {
  /** Email addresses (from Gmail, Calendar attendees) */
  emails: string[]
  /** Phone numbers in E.164 format (from WhatsApp, Telegram) */
  phones: string[]
  /** LinkedIn public identifier / slug */
  linkedinSlug?: string
  /** Slack user ID (within a specific workspace) */
  slackUserId?: string
  /** Google People API resource name */
  googleContactId?: string
  /** Telegram username */
  telegramUsername?: string
}

// ----- Contact -----

export interface Contact {
  contactId: ContactId
  userId: string

  // Core identity
  displayName: string
  firstName?: string
  lastName?: string
  avatarUrl?: string

  // Professional context
  title?: string
  company?: string
  bio?: string

  // Dunbar circle & significance
  circle: DunbarCircle
  /** 1-5 significance level (maps to Dunbar circles: 5=Core, 1=Acquaintance). Indexed. */
  significance: number

  // Cross-channel identity
  identifiers: ContactIdentifiers

  // Relationship metadata
  /** Free-form relationship label (e.g. "Mentor", "Co-founder", "Client") */
  relationship?: string
  tags: string[]
  /** Free-form notes about this contact */
  notes?: string

  // AI enrichment link
  /** Link to AI-researched SenderPersona for enriched display */
  senderPersonaId?: SenderPersonaId

  // Follow-up tracking
  /** Custom cadence override in days (null = use circle default) */
  followUpCadenceDays?: number
  /** Next follow-up timestamp (indexed for due queries) */
  nextFollowUpMs?: number
  /** Last interaction timestamp (indexed for recency queries) */
  lastInteractionMs?: number

  // Source tracking
  sources: ContactSource[]
  primarySource?: ContactSource

  // Status
  archived: boolean
  starred: boolean
  createdAtMs: number
  updatedAtMs: number
}

export type CreateContactInput = Omit<
  Contact,
  'contactId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'archived' | 'starred'
>

export type UpdateContactInput = Partial<
  Omit<Contact, 'contactId' | 'userId' | 'createdAtMs' | 'updatedAtMs'>
>

// ----- Interaction -----

export interface Interaction {
  interactionId: InteractionId
  contactId: ContactId
  userId: string

  type: InteractionType
  /** Short description of the interaction */
  summary: string
  /** Longer details / transcript excerpt */
  details?: string

  // Source reference
  source: ContactSource
  /** Original ID from the source system (messageId, eventId, noteId) */
  sourceId?: string

  // Meeting-specific
  meetingTitle?: string
  /** AI-extracted insights from meeting transcript */
  meetingInsights?: string[]

  // Direction
  direction?: 'inbound' | 'outbound' | 'bilateral'

  // Timestamps
  occurredAtMs: number
  createdAtMs: number
}

export type CreateInteractionInput = Omit<Interaction, 'interactionId' | 'createdAtMs'>

// ----- Constants -----

export const CIRCLE_LABELS: Record<DunbarCircle, string> = {
  0: 'Core',
  1: 'Inner',
  2: 'Active',
  3: 'Extended',
  4: 'Acquaintance',
}

export const CIRCLE_DESCRIPTIONS: Record<DunbarCircle, string> = {
  0: '~5 closest (partner, family, best friends)',
  1: '~15 close friends and mentors',
  2: '~50 good friends and colleagues',
  3: '~150 meaningful contacts',
  4: 'Everyone else',
}

/** Default follow-up cadence in days per Dunbar circle */
export const DEFAULT_FOLLOW_UP_DAYS: Record<DunbarCircle, number> = {
  0: 7,
  1: 14,
  2: 30,
  3: 90,
  4: 0, // no auto follow-up for acquaintances
}

/** Maps circle to significance (for Firestore index compatibility) */
export const CIRCLE_TO_SIGNIFICANCE: Record<DunbarCircle, number> = {
  0: 5,
  1: 4,
  2: 3,
  3: 2,
  4: 1,
}

// ----- Helper Functions -----

/**
 * Compute follow-up status relative to current time
 */
export function getFollowUpStatus(contact: Contact, nowMs: number = Date.now()): FollowUpStatus {
  if (!contact.nextFollowUpMs) return 'ok'
  const daysUntil = (contact.nextFollowUpMs - nowMs) / (24 * 60 * 60 * 1000)
  if (daysUntil < -7) return 'overdue'
  if (daysUntil < 0) return 'due'
  if (daysUntil < 3) return 'upcoming'
  return 'ok'
}

/**
 * Compute the next follow-up timestamp based on circle cadence
 */
export function computeNextFollowUp(
  contact: Contact,
  interactionMs: number
): number | undefined {
  const cadence = contact.followUpCadenceDays ?? DEFAULT_FOLLOW_UP_DAYS[contact.circle]
  if (cadence <= 0) return undefined
  return interactionMs + cadence * 24 * 60 * 60 * 1000
}

/**
 * Normalize an email address for dedup comparison
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}
