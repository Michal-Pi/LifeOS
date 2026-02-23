/**
 * ContactList — scrollable list of ContactCards with circle filter
 */

import { useMemo } from 'react'
import { ContactCard } from './ContactCard'
import { CircleFilter } from './CircleFilter'
import type { Contact, ContactId, DunbarCircle } from '@lifeos/agents'

interface ContactListProps {
  contacts: Contact[]
  selectedId: ContactId | null
  circle: DunbarCircle | undefined
  onCircleChange: (circle: DunbarCircle | undefined) => void
  onSelect: (contactId: ContactId) => void
}

export function ContactList({
  contacts,
  selectedId,
  circle,
  onCircleChange,
  onSelect,
}: ContactListProps) {
  const counts = useMemo(() => {
    const c: Record<DunbarCircle | 'all', number> = {
      all: contacts.length,
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    }
    // We need to count all contacts, not just filtered ones
    // So we accept raw contacts list and compute from there
    for (const contact of contacts) {
      c[contact.circle as DunbarCircle]++
    }
    return c
  }, [contacts])

  return (
    <>
      <div style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <CircleFilter selected={circle} onChange={onCircleChange} counts={counts} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {contacts.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
            No contacts found
          </div>
        ) : (
          contacts.map((contact) => (
            <ContactCard
              key={contact.contactId}
              contact={contact}
              selected={contact.contactId === selectedId}
              onClick={() => onSelect(contact.contactId)}
            />
          ))
        )}
      </div>
    </>
  )
}
