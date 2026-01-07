/**
 * Template Selector Component
 *
 * Modal for selecting a note template when creating a new note.
 * Displays available templates with descriptions and icons.
 */

import { noteTemplates, type NoteTemplate } from '@/lib/noteTemplates'

export interface TemplateSelectorProps {
  isOpen: boolean
  onSelect: (templateId: string) => void
  onCancel: () => void
}

export function TemplateSelector({ isOpen, onSelect, onCancel }: TemplateSelectorProps) {
  if (!isOpen) return null

  const handleTemplateClick = (template: NoteTemplate) => {
    onSelect(template.id)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal-content template-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Choose a Template</h2>
            <p className="template-selector-subtitle">
              Start your note with a predefined structure
            </p>
          </div>
          <button className="close-button" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="template-grid">
            {noteTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleTemplateClick(template)}
                className="template-card"
              >
                <div className="template-card-content">
                  <span className="template-icon">{template.icon}</span>
                  <div className="template-info">
                    <h3 className="template-name">{template.name}</h3>
                    <p className="template-description">{template.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        .template-selector-modal {
          max-width: 42rem;
          max-height: 80vh;
        }

        .template-selector-subtitle {
          margin: 0.25rem 0 0 0;
          font-size: 0.875rem;
          color: var(--muted-foreground);
        }

        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1rem;
        }

        .template-card {
          text-align: left;
          padding: 1rem;
          border: 2px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          cursor: pointer;
          transition:
            border-color var(--motion-standard) var(--motion-ease),
            box-shadow var(--motion-standard) var(--motion-ease);
        }

        .template-card:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent-subtle);
        }

        .template-card:focus-visible {
          outline: 2px solid transparent;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .template-card-content {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .template-icon {
          font-size: 1.875rem;
          flex-shrink: 0;
          line-height: 1;
        }

        .template-info {
          flex: 1;
          min-width: 0;
        }

        .template-name {
          margin: 0 0 0.25rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .template-description {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted-foreground);
          line-height: 1.5;
        }
      `}</style>
    </div>
  )
}
