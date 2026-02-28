/**
 * QuickAddContact — minimal contact creation modal
 *
 * Shows only name, email, circle selector. "More details" opens
 * the full ContactFormModal.
 */

import { useState, useCallback } from 'react'
import type { DunbarCircle, CreateContactInput } from '@lifeos/agents'
import { CIRCLE_LABELS, CIRCLE_TO_SIGNIFICANCE } from '@lifeos/agents'
import { Modal } from '@/components/ui/Modal'

interface QuickAddContactProps {
  onSave: (data: CreateContactInput) => Promise<void>
  onOpenFullForm: () => void
  onClose: () => void
}

const CIRCLES: DunbarCircle[] = [0, 1, 2, 3, 4]

export function QuickAddContact({ onSave, onOpenFullForm, onClose }: QuickAddContactProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [circle, setCircle] = useState<DunbarCircle>(2)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const emails = email.trim() ? [email.trim().toLowerCase()] : []
      const input: CreateContactInput = {
        displayName: name.trim(),
        circle,
        significance: CIRCLE_TO_SIGNIFICANCE[circle],
        identifiers: { emails, phones: [] },
        tags: [],
        sources: ['manual'],
      }
      await onSave(input)
      onClose()
    } catch (err) {
      console.error('Error creating contact:', err)
    } finally {
      setSaving(false)
    }
  }, [name, email, circle, onSave, onClose])

  const footer = (
    <>
      <button type="button" className="quick-add__more-btn" onClick={onOpenFullForm}>
        More details
      </button>
      <button
        type="button"
        className="quick-add__save-btn"
        onClick={handleSave}
        disabled={!name.trim() || saving}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </>
  )

  return (
    <Modal open onClose={onClose} size="sm" title="Quick Add Contact" footer={footer}>
      <div className="quick-add">
        <div className="quick-add__field">
          <label className="quick-add__label">Name *</label>
          <input
            className="quick-add__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
        </div>
        <div className="quick-add__field">
          <label className="quick-add__label">Email</label>
          <input
            className="quick-add__input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            type="email"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
        </div>
        <div className="quick-add__field">
          <label className="quick-add__label">Circle</label>
          <div className="quick-add__circles">
            {CIRCLES.map((c) => (
              <button
                key={c}
                type="button"
                className={`quick-add__circle-btn${circle === c ? ' quick-add__circle-btn--active' : ''}`}
                onClick={() => setCircle(c)}
              >
                {CIRCLE_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
