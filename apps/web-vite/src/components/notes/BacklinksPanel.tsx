/**
 * BacklinksPanel Component
 *
 * Displays notes that link to the current note.
 */

import { useBacklinks } from '@/hooks/useNoteGraph'
import type { NoteId } from '@lifeos/notes'

export interface BacklinksPanelProps {
  noteId: NoteId | null
  onNoteClick?: (noteId: NoteId) => void
}

export function BacklinksPanel({ noteId, onNoteClick }: BacklinksPanelProps) {
  const { backlinks, isLoading, error } = useBacklinks(noteId)

  if (isLoading) {
    return (
      <div className="backlinks-panel">
        <div className="backlinks-panel__header">Backlinks</div>
        <div className="backlinks-panel__loading">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="backlinks-panel">
        <div className="backlinks-panel__header">Backlinks</div>
        <div className="backlinks-panel__error">Error loading backlinks: {error.message}</div>
      </div>
    )
  }

  if (backlinks.length === 0) {
    return (
      <div className="backlinks-panel">
        <div className="backlinks-panel__header">Backlinks</div>
        <div className="backlinks-panel__empty">No notes link to this note yet.</div>
      </div>
    )
  }

  return (
    <div className="backlinks-panel">
      <div className="backlinks-panel__header">Backlinks ({backlinks.length})</div>
      <div className="backlinks-panel__list">
        {backlinks.map((note) => (
          <div
            key={note.noteId}
            className="backlinks-panel__item"
            onClick={() => onNoteClick?.(note.noteId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onNoteClick?.(note.noteId)
              }
            }}
          >
            <div className="backlinks-panel__item-title">{note.title}</div>
            {note.contentHtml && (
              <div
                className="backlinks-panel__item-preview"
                dangerouslySetInnerHTML={{
                  __html: note.contentHtml.substring(0, 100) + '...',
                }}
              />
            )}
          </div>
        ))}
      </div>
      <style>{`
        .backlinks-panel {
          border-top: 1px solid var(--border);
          padding-top: 1.5rem;
          margin-top: 1.5rem;
        }
        .backlinks-panel__header {
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--foreground);
          margin-bottom: 0.75rem;
        }
        .backlinks-panel__loading,
        .backlinks-panel__error,
        .backlinks-panel__empty {
          color: var(--muted-foreground);
          font-size: 0.8125rem;
          padding: 0.5rem 0;
        }
        .backlinks-panel__error {
          color: var(--error);
        }
        .backlinks-panel__list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .backlinks-panel__item {
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .backlinks-panel__item:hover {
          background: var(--background-secondary);
          border-color: var(--border-strong);
        }
        .backlinks-panel__item:focus {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .backlinks-panel__item-title {
          font-weight: 500;
          font-size: 0.875rem;
          color: var(--foreground);
          margin-bottom: 0.25rem;
        }
        .backlinks-panel__item-preview {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          line-height: 1.4;
        }
      `}</style>
    </div>
  )
}
