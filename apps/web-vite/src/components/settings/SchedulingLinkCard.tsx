/**
 * @fileoverview Card for displaying a single scheduling link in settings.
 */

import type { SchedulingLink } from '@/hooks/useSchedulingLinks'
import { toast } from 'sonner'

interface SchedulingLinkCardProps {
  link: SchedulingLink
  onEdit: () => void
  onDelete: () => void
  onToggle: (active: boolean) => void
}

export function SchedulingLinkCard({ link, onEdit, onDelete, onToggle }: SchedulingLinkCardProps) {
  const fullUrl = `${window.location.origin}/schedule/${link.slug}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <div className={`scheduling-link-card${!link.active ? ' scheduling-link-card--inactive' : ''}`}>
      <div className="scheduling-link-card__info">
        <h4 className="scheduling-link-card__title">{link.title || 'Untitled'}</h4>
        <p className="scheduling-link-card__slug">/schedule/{link.slug || '...'}</p>
        <div className="scheduling-link-card__durations">
          {link.durations.map((d) => (
            <span key={d} className="scheduling-link-card__duration-badge">
              {d} min
            </span>
          ))}
          {link.bufferMinutes > 0 && (
            <span className="scheduling-link-card__meta">{link.bufferMinutes}min buffer</span>
          )}
        </div>
      </div>

      <div className="scheduling-link-card__actions">
        <label className="scheduling-link-card__toggle">
          <input
            type="checkbox"
            checked={link.active}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="scheduling-link-card__toggle-label">
            {link.active ? 'Active' : 'Inactive'}
          </span>
        </label>
        <button type="button" className="ghost-button small" onClick={copyLink}>
          Copy Link
        </button>
        <button type="button" className="ghost-button small" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="ghost-button small danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
