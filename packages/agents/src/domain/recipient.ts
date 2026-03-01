/**
 * Recipient Types
 *
 * Shared types for multi-recipient message composition.
 * Used by the mailbox composer, outbox, and channel adapters.
 */

import type { ContactId } from './contacts'
import type { MessageSource } from './mailbox'
import type { DunbarCircle } from './contacts'

/**
 * A resolved recipient for the mailbox composer.
 * Can represent a CRM contact, a raw email/ID, or a suggestion.
 */
export interface Recipient {
  /** Unique key for dedup (email, slackUserId, linkedinSlug, phone, etc.) */
  id: string
  /** Display name */
  name: string
  /** Email address (for Gmail/LinkedIn channels) */
  email?: string
  /** CRM contact ID if resolved */
  contactId?: ContactId
  /** Which channel this recipient is reachable on */
  channel: MessageSource
  /** Avatar URL from CRM contact */
  avatarUrl?: string
  /** Dunbar circle for sorting priority */
  circle?: DunbarCircle
}

/** Serializable recipient entry for storage (Firestore, IndexedDB) */
export interface RecipientEntry {
  id: string
  name?: string
  email?: string
  contactId?: string
}
