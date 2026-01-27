import { useState } from 'react'
import type { Conflict } from '@lifeos/agents'
import { Button } from '@/components/ui/button'
import './ConflictResolutionPanel.css'

type Props = {
  conflicts: Conflict[]
  onResolve: (conflict: Conflict) => void
}

export function ConflictResolutionPanel({ conflicts, onResolve }: Props) {
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null)
  const unresolved = conflicts.filter((conflict) => !conflict.resolved)

  if (unresolved.length === 0) return null

  return (
    <div className="conflict-panel">
      <div className="conflict-header">
        <span className="conflict-icon" aria-hidden="true">
          ⚠️
        </span>
        <h3>
          {unresolved.length} Conflict{unresolved.length > 1 ? 's' : ''} Detected
        </h3>
      </div>

          <div className="conflict-list">
            {unresolved.map((conflict) => (
          <Button
            variant="ghost"
            key={conflict.conflictId}
            type="button"
            className="conflict-card"
            onClick={() => setSelectedConflict(conflict)}
          >
            <span className={`conflict-severity conflict-severity--${conflict.severity}`}>
              {conflict.severity}
            </span>
            <p>{conflict.description}</p>
          </Button>
            ))}
          </div>

      {selectedConflict && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content conflict-modal__content">
            <h4>Resolve Conflict</h4>
            <p>{selectedConflict.description}</p>
            <div className="conflict-modal__actions">
              <Button variant="ghost" type="button" onClick={() => setSelectedConflict(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onResolve(selectedConflict)
                  setSelectedConflict(null)
                }}
              >
                Mark Resolved
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
