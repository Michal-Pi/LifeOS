/**
 * FollowUpWidget — compact list of contacts due for follow-up.
 * Designed for the Today dashboard grid.
 */

import type { Contact, DunbarCircle, FollowUpStatus } from '@lifeos/agents'
import { CIRCLE_LABELS, getFollowUpStatus } from '@lifeos/agents'
import { useNavigate } from 'react-router-dom'
import { useFollowUpDue } from '@/hooks/useFollowUpDue'
import { Button } from '@/components/ui/button'
import '@/styles/components/FollowUpWidget.css'

interface FollowUpWidgetProps {
  maxContacts?: number
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

const DAY_MS = 24 * 60 * 60 * 1000

function getFollowUpHint(contact: Contact): string {
  if (!contact.nextFollowUpMs) return ''
  const daysUntil = (contact.nextFollowUpMs - Date.now()) / DAY_MS
  const absDays = Math.abs(Math.round(daysUntil))

  if (daysUntil < -1) return `${absDays}d overdue`
  if (daysUntil < 0) return 'due today'
  if (absDays === 0) return 'due today'
  if (absDays === 1) return 'tomorrow'
  return `in ${absDays}d`
}

const VISIBLE_STATUSES: FollowUpStatus[] = ['overdue', 'due', 'upcoming']

export function FollowUpWidget({ maxContacts = 8 }: FollowUpWidgetProps) {
  const navigate = useNavigate()
  const { contacts, loading } = useFollowUpDue(maxContacts)

  if (loading) {
    return (
      <section className="today-card followup-widget today-grid-followup">
        <div className="today-card-header">
          <div>
            <p className="section-label">Follow-Ups Due</p>
            <p className="section-hint">People to reach out to.</p>
          </div>
        </div>
        <div className="followup-widget__empty">Loading...</div>
      </section>
    )
  }

  return (
    <section className="today-card followup-widget today-grid-followup">
      <div className="today-card-header">
        <div>
          <p className="section-label">Follow-Ups Due</p>
          <p className="section-hint">People to reach out to.</p>
        </div>
        {contacts.length > 0 && (
          <Button variant="ghost" className="small" onClick={() => navigate('/people')}>
            View all
          </Button>
        )}
      </div>

      {contacts.length === 0 ? (
        <div className="followup-widget__empty">
          No follow-ups due &mdash; you&rsquo;re caught up.
        </div>
      ) : (
        <div className="followup-widget__list">
          {contacts.map((contact) => {
            const status = getFollowUpStatus(contact)
            const hint = getFollowUpHint(contact)

            return (
              <div
                key={contact.contactId}
                className="followup-widget__item"
                onClick={() => navigate(`/people?contactId=${contact.contactId}`)}
              >
                <div className="followup-widget__avatar">
                  {contact.avatarUrl ? (
                    <img src={contact.avatarUrl} alt={contact.displayName} />
                  ) : (
                    getInitials(contact.displayName)
                  )}
                </div>

                <div className="followup-widget__info">
                  <span className="followup-widget__name">{contact.displayName}</span>
                  {hint && <span className="followup-widget__hint">{hint}</span>}
                </div>

                <div className="followup-widget__badges">
                  {VISIBLE_STATUSES.includes(status) && (
                    <span
                      className={`followup-widget__status-dot followup-widget__status-dot--${status}`}
                    />
                  )}
                  <span
                    className={`followup-widget__circle-badge followup-widget__circle-badge--${contact.circle}`}
                  >
                    {CIRCLE_LABELS[contact.circle as DunbarCircle]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
