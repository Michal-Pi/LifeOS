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
    <div className="contact-list">
      {contacts.length === 0 ? (
        <div className="contact-list__empty">No contacts found</div>
      ) : (
        <div className="contact-list__items">
          {contacts.map((contact) => (
            <ContactCard
              key={contact.contactId}
              contact={contact}
              selected={contact.contactId === selectedId}
              onClick={() => onSelect(contact.contactId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
