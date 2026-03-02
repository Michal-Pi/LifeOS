/**
 * CalendarSchedulingPanel — Scheduling links and upcoming bookings in the calendar sidebar.
 *
 * Reuses SchedulingLinkCard and SchedulingLinkModal from the settings page.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import type { SchedulingLink } from '@/hooks/useSchedulingLinks'
import { createDefaultLink } from '@/hooks/useSchedulingLinks'
import type { Booking } from '@/hooks/useUpcomingBookings'
import { SchedulingLinkCard } from '@/components/settings/SchedulingLinkCard'
import { SchedulingLinkModal } from '@/components/settings/SchedulingLinkModal'

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
})

interface CalendarSchedulingPanelProps {
  links: SchedulingLink[]
  bookings: Booking[]
  linksLoading: boolean
  bookingsLoading: boolean
  onSaveLink: (link: SchedulingLink) => Promise<void>
  onDeleteLink: (linkId: string) => Promise<void>
  onToggleLink: (linkId: string, active: boolean) => Promise<void>
  compact?: boolean
}

export function CalendarSchedulingPanel({
  links,
  bookings,
  linksLoading,
  bookingsLoading,
  onSaveLink,
  onDeleteLink,
  onToggleLink,
  compact = false,
}: CalendarSchedulingPanelProps) {
  const [expanded, setExpanded] = useState(!compact)
  const [editingLink, setEditingLink] = useState<SchedulingLink | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const activeLinks = links.filter((l) => l.active)

  const openCreate = () => {
    setEditingLink(createDefaultLink())
    setModalOpen(true)
  }

  const openEdit = (link: SchedulingLink) => {
    setEditingLink(link)
    setModalOpen(true)
  }

  const handleDelete = async (linkId: string) => {
    if (!confirm('Delete this scheduling link? This cannot be undone.')) return
    try {
      await onDeleteLink(linkId)
    } catch {
      toast.error('Failed to delete scheduling link')
    }
  }

  const handleSave = async (link: SchedulingLink) => {
    await onSaveLink(link)
    setModalOpen(false)
    setEditingLink(null)
  }

  const showContent = compact ? expanded : true

  return (
    <div className="calendar-scheduling">
      <div className="calendar-scheduling__header">
        <p className="section-label" style={{ margin: 0 }}>
          Scheduling
          {compact && activeLinks.length > 0 && (
            <span className="calendar-scheduling__count"> ({activeLinks.length} active)</span>
          )}
        </p>

        {compact && (
          <button
            type="button"
            className="calendar-scheduling__toggle"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? '\u25B4' : '\u25BE'}
          </button>
        )}
      </div>

      {showContent && (
        <>
          {linksLoading ? (
            <p className="calendar-meta">Loading scheduling links...</p>
          ) : links.length === 0 ? (
            <div>
              <p className="calendar-meta">
                No scheduling links yet. Create one to let others book time on your calendar.
              </p>
              <button
                type="button"
                className="primary-button small"
                onClick={openCreate}
                style={{ marginTop: 'var(--space-2)' }}
              >
                + New Link
              </button>
            </div>
          ) : (
            <>
              <div className="calendar-scheduling__links">
                {links.map((link) => (
                  <SchedulingLinkCard
                    key={link.id}
                    link={link}
                    onEdit={() => openEdit(link)}
                    onDelete={() => handleDelete(link.id)}
                    onToggle={(active) => onToggleLink(link.id, active)}
                  />
                ))}
              </div>
              <button type="button" className="ghost-button small" onClick={openCreate}>
                + New Link
              </button>
            </>
          )}

          {/* Upcoming Bookings */}
          {!bookingsLoading && bookings.length > 0 && (
            <div className="calendar-scheduling__bookings">
              <p className="section-label">Upcoming Bookings</p>
              {bookings.slice(0, 5).map((booking) => (
                <div key={booking.id} className="calendar-booking-item">
                  <span className="calendar-booking-item__guest">{booking.guestName}</span>
                  <span className="calendar-booking-item__time">
                    {timeFormatter.format(new Date(booking.startTime))}
                  </span>
                  <span className="calendar-booking-item__duration">{booking.duration}m</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <SchedulingLinkModal
        open={modalOpen}
        link={editingLink}
        onClose={() => {
          setModalOpen(false)
          setEditingLink(null)
        }}
        onSave={handleSave}
        onError={(msg) => toast.error(msg)}
      />
    </div>
  )
}
