/**
 * ContactList — scrollable list of ContactCards
 *
 * Circle filtering is now handled by CircleVisualization at the page level.
 */

import { ContactCard } from './ContactCard'
import type { Contact, ContactId } from '@lifeos/agents'

interface ContactListProps {
  contacts: Contact[]
  selectedId: ContactId | null
  onSelect: (contactId: ContactId) => void
}

export function ContactList({ contacts, selectedId, onSelect }: ContactListProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {contacts.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '0.875rem',
          }}
        >
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
  )
}
