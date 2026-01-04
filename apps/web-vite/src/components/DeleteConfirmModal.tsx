'use client'

import { useState } from 'react'

export type DeleteScope = 'this' | 'this_and_future' | 'all'

interface DeleteConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (scope?: DeleteScope) => void
  eventTitle?: string
  isRecurring?: boolean
  isRecurrenceInstance?: boolean
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  eventTitle,
  isRecurring,
  isRecurrenceInstance,
}: DeleteConfirmModalProps) {
  const [selectedScope, setSelectedScope] = useState<DeleteScope | null>(null)

  if (!isOpen) return null

  const showScopePicker = isRecurring || isRecurrenceInstance

  const handleConfirm = () => {
    if (showScopePicker && !selectedScope) return
    onConfirm(showScopePicker ? selectedScope! : undefined)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Event</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {showScopePicker ? (
            <>
              <p>This event is part of a recurring series. Which events do you want to delete?</p>
              <div className="delete-scope-section">
                <div className="scope-options">
                  <label className={`scope-option ${selectedScope === 'this' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="deleteScope"
                      value="this"
                      checked={selectedScope === 'this'}
                      onChange={() => setSelectedScope('this')}
                    />
                    <span className="scope-label">This event only</span>
                    <span className="scope-hint">Delete only this occurrence</span>
                  </label>
                  <label
                    className={`scope-option ${selectedScope === 'this_and_future' ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="deleteScope"
                      value="this_and_future"
                      checked={selectedScope === 'this_and_future'}
                      onChange={() => setSelectedScope('this_and_future')}
                    />
                    <span className="scope-label">This and future events</span>
                    <span className="scope-hint">Delete this and all following occurrences</span>
                  </label>
                  <label className={`scope-option ${selectedScope === 'all' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="deleteScope"
                      value="all"
                      checked={selectedScope === 'all'}
                      onChange={() => setSelectedScope('all')}
                    />
                    <span className="scope-label">All events</span>
                    <span className="scope-hint">Delete the entire series</span>
                  </label>
                </div>
              </div>
            </>
          ) : (
            <p>
              Are you sure you want to delete <strong>{eventTitle || 'this event'}</strong>? This
              action cannot be undone.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ghost-button danger"
            onClick={handleConfirm}
            disabled={showScopePicker && !selectedScope}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
