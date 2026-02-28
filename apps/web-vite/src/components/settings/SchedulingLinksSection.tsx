/**
 * @fileoverview Settings section for managing scheduling links.
 */

import { useState } from 'react'
import {
  useSchedulingLinks,
  createDefaultLink,
  type SchedulingLink,
} from '@/hooks/useSchedulingLinks'
import { SchedulingLinkCard } from './SchedulingLinkCard'
import { SchedulingLinkModal } from './SchedulingLinkModal'

interface SchedulingLinksSectionProps {
  userId: string | undefined
  onError: (message: string) => void
}

export function SchedulingLinksSection({ userId, onError }: SchedulingLinksSectionProps) {
  const { links, loading, saveLink, deleteLink, toggleActive } = useSchedulingLinks(userId)
  const [editingLink, setEditingLink] = useState<SchedulingLink | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

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
      await deleteLink(linkId)
    } catch {
      onError('Failed to delete scheduling link')
    }
  }

  const handleSave = async (link: SchedulingLink) => {
    await saveLink(link)
    setModalOpen(false)
    setEditingLink(null)
  }

  return (
    <section id="scheduling">
      <div className="settings-section__header-row">
        <div>
          <h2 className="settings-section__title">Scheduling Links</h2>
          <p className="settings-section__description">
            Create shareable booking pages backed by your Google Calendar availability.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={openCreate}>
          + New Link
        </button>
      </div>

      {loading ? (
        <p className="settings-section__loading">Loading...</p>
      ) : links.length === 0 ? (
        <div className="scheduling-empty">
          <p>No scheduling links yet.</p>
          <p className="scheduling-empty__hint">
            Create your first link to let others book time on your calendar.
          </p>
        </div>
      ) : (
        <div className="scheduling-links-list">
          {links.map((link) => (
            <SchedulingLinkCard
              key={link.id}
              link={link}
              onEdit={() => openEdit(link)}
              onDelete={() => handleDelete(link.id)}
              onToggle={(active) => toggleActive(link.id, active)}
            />
          ))}
        </div>
      )}

      <SchedulingLinkModal
        open={modalOpen}
        link={editingLink}
        onClose={() => {
          setModalOpen(false)
          setEditingLink(null)
        }}
        onSave={handleSave}
        onError={onError}
      />
    </section>
  )
}
