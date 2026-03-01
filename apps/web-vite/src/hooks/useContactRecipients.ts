/**
 * useContactRecipients Hook
 *
 * CRM-backed recipient suggestions for the mailbox composer.
 * Primary source: CRM contacts (via useContacts) with channel-specific identifier filtering.
 * Secondary source: recent message senders (via useRecipientSuggestions) for non-CRM contacts.
 *
 * Performance: Contacts are loaded once via real-time Firestore subscription.
 * All filtering is client-side with useMemo (sub-millisecond for 500 contacts).
 */

import { useMemo } from 'react'
import { useContacts } from '@/hooks/useContacts'
import { useRecipientSuggestions } from '@/hooks/useRecipientSuggestions'
import type { Contact, MessageSource } from '@lifeos/agents'
import type { Recipient } from '@lifeos/agents'

interface UseContactRecipientsOptions {
  /** Current channel for filtering contact availability */
  channel: MessageSource
  /** Search query text */
  queryText: string
  /** Recipients already selected (excluded from results) */
  excludeIds?: string[]
}

interface UseContactRecipientsResult {
  suggestions: Recipient[]
  loading: boolean
}

/**
 * Get the channel-specific identifier from a contact's identifiers.
 * Returns the primary ID to use for the selected channel, or undefined if unavailable.
 */
function getContactIdForChannel(contact: Contact, channel: MessageSource): string | undefined {
  switch (channel) {
    case 'gmail':
      return contact.identifiers.emails[0]
    case 'linkedin':
      return contact.identifiers.linkedinSlug
    case 'slack':
      return contact.identifiers.slackUserId
    case 'whatsapp':
      return contact.identifiers.phones[0]
    case 'telegram':
      return contact.identifiers.telegramUsername
    default:
      return undefined
  }
}

/**
 * Check which channels a contact is available on.
 */
function getAvailableChannels(contact: Contact): MessageSource[] {
  const channels: MessageSource[] = []
  if (contact.identifiers.emails.length > 0) channels.push('gmail')
  if (contact.identifiers.linkedinSlug) channels.push('linkedin')
  if (contact.identifiers.slackUserId) channels.push('slack')
  if (contact.identifiers.phones.length > 0) channels.push('whatsapp')
  if (contact.identifiers.telegramUsername) channels.push('telegram')
  return channels
}

/**
 * Map a CRM contact to a Recipient for the selected channel.
 */
function contactToRecipient(contact: Contact, channel: MessageSource): Recipient | null {
  const channelId = getContactIdForChannel(contact, channel)
  if (!channelId) return null

  return {
    id: channelId,
    name: contact.displayName,
    email: contact.identifiers.emails[0],
    contactId: contact.contactId,
    channel,
    avatarUrl: contact.avatarUrl,
    circle: contact.circle,
  }
}

export function useContactRecipients({
  channel,
  queryText,
  excludeIds = [],
}: UseContactRecipientsOptions): UseContactRecipientsResult {
  // Primary source: CRM contacts (real-time subscription, loaded once)
  const { contacts, loading: contactsLoading } = useContacts({ maxContacts: 500 })

  // Secondary source: recent message senders (for non-CRM contacts)
  const { suggestions: legacySuggestions, loading: legacyLoading } =
    useRecipientSuggestions(queryText)

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  const suggestions = useMemo(() => {
    // 1. Map CRM contacts to recipients for the selected channel
    const crmRecipients: Recipient[] = []
    for (const contact of contacts) {
      const recipient = contactToRecipient(contact, channel)
      if (recipient && !excludeSet.has(recipient.id)) {
        crmRecipients.push(recipient)
      }
    }

    // 2. Filter by query text (name, email, company)
    let filtered = crmRecipients
    if (queryText.trim()) {
      const lowerQuery = queryText.toLowerCase()
      filtered = crmRecipients.filter((r) => {
        // Find the original contact for richer matching
        const contact = contacts.find((c) => c.contactId === r.contactId)
        return (
          r.name.toLowerCase().includes(lowerQuery) ||
          (r.email && r.email.toLowerCase().includes(lowerQuery)) ||
          r.id.toLowerCase().includes(lowerQuery) ||
          (contact?.company && contact.company.toLowerCase().includes(lowerQuery)) ||
          (contact?.title && contact.title.toLowerCase().includes(lowerQuery))
        )
      })
    }

    // 3. Sort: circle importance (Core=0 first), then lastInteractionMs
    filtered.sort((a, b) => {
      const circleA = a.circle ?? 4
      const circleB = b.circle ?? 4
      if (circleA !== circleB) return circleA - circleB

      // Within same circle, sort by last interaction (most recent first)
      const contactA = contacts.find((c) => c.contactId === a.contactId)
      const contactB = contacts.find((c) => c.contactId === b.contactId)
      const interactionA = contactA?.lastInteractionMs ?? 0
      const interactionB = contactB?.lastInteractionMs ?? 0
      return interactionB - interactionA
    })

    // 4. Merge legacy suggestions (non-CRM senders) as secondary
    const crmIds = new Set(filtered.map((r) => r.id.toLowerCase()))
    const legacyRecipients: Recipient[] = []
    for (const legacy of legacySuggestions) {
      const legacyId = (legacy.email ?? legacy.name).toLowerCase()
      if (!crmIds.has(legacyId) && !excludeSet.has(legacy.email ?? legacy.name)) {
        legacyRecipients.push({
          id: legacy.email ?? legacy.name,
          name: legacy.name,
          email: legacy.email,
          channel: legacy.source,
        })
      }
    }

    // 5. Combine and limit
    return [...filtered, ...legacyRecipients].slice(0, 10)
  }, [contacts, channel, queryText, legacySuggestions, excludeSet])

  return {
    suggestions,
    loading: contactsLoading || legacyLoading,
  }
}

export { getAvailableChannels, getContactIdForChannel }
