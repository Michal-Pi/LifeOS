/**
 * ContactCard — list item in the contact sidebar
 */

import type { Contact } from '@lifeos/agents'
import { CIRCLE_LABELS, getFollowUpStatus } from '@lifeos/agents'
import type { DunbarCircle, FollowUpStatus } from '@lifeos/agents'
import '@/styles/components/ContactCard.css'

interface ContactCardProps {
  contact: Contact
  selected: boolean
  onClick: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const FOLLOW_UP_VISIBLE: FollowUpStatus[] = ['overdue', 'due', 'upcoming']

export function ContactCard({ contact, selected, onClick }: ContactCardProps) {
  const followUpStatus = getFollowUpStatus(contact)
  const meta = [contact.title, contact.company].filter(Boolean).join(' at ')

  return (
    <div
      className={`contact-card contact-card--circle-${contact.circle}${selected ? ' contact-card--selected' : ''}`}
      onClick={onClick}
    >
      <div className="contact-card__avatar">
        {contact.avatarUrl ? (
          <img src={contact.avatarUrl} alt={contact.displayName} />
        ) : (
          getInitials(contact.displayName)
        )}
      </div>

      <div className="contact-card__info">
        <div className="contact-card__name">
          {contact.starred && <span className="contact-card__star">&#9733; </span>}
          {contact.displayName}
        </div>
        {meta && <div className="contact-card__meta">{meta}</div>}
      </div>

      <div className="contact-card__badges">
        {FOLLOW_UP_VISIBLE.includes(followUpStatus) && (
          <span
            className={`contact-card__followup-dot contact-card__followup-dot--${followUpStatus}`}
          />
        )}
        <span
          className={`contact-card__circle-badge contact-card__circle-badge--${contact.circle}`}
        >
          {CIRCLE_LABELS[contact.circle as DunbarCircle]}
        </span>
      </div>
    </div>
  )
}
