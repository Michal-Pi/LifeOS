/**
 * Conflict Resolution Modal
 *
 * Displays conflicts between local and remote versions of a note.
 * Allows user to choose which version to keep or merge manually.
 */

import React, { useState, useMemo, useEffect } from 'react'
import type { Note } from '@lifeos/notes'
import { validateNote } from '@lifeos/notes'
import './ConflictResolutionModal.css'

export interface NoteConflict {
  localNote: Note
  remoteNote: Note
  conflictFields: Array<keyof Note>
}

export interface ConflictResolutionModalProps {
  conflict: NoteConflict
  onResolve: (resolution: 'local' | 'remote' | 'merge', mergedNote?: Note) => void
  onCancel: () => void
  isOpen: boolean
}

export function ConflictResolutionModal({
  conflict,
  onResolve,
  onCancel,
  isOpen,
}: ConflictResolutionModalProps) {
  const [selectedVersion, setSelectedVersion] = useState<'local' | 'remote' | 'merge'>('local')
  const [fieldSelections, setFieldSelections] = useState<Record<string, 'local' | 'remote'>>({})
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const { localNote, remoteNote, conflictFields } = conflict

  // Initialize field selections when merge is selected
  useEffect(() => {
    if (selectedVersion === 'merge' && isOpen) {
      const initialSelections: Record<string, 'local' | 'remote'> = {}
      conflictFields.forEach((field) => {
        // Default to local for most fields, but can be changed
        initialSelections[field as string] = 'local'
      })
      setFieldSelections(initialSelections)
    }
  }, [selectedVersion, conflictFields, isOpen])

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleString()
  }

  /**
   * Merge two notes based on field selections
   */
  const createMergedNote = useMemo((): Note | null => {
    if (selectedVersion !== 'merge') return null

    const merged: Note = {
      ...localNote,
      // Use the most recent timestamp
      updatedAtMs: Math.max(localNote.updatedAtMs, remoteNote.updatedAtMs),
      version: Math.max(localNote.version, remoteNote.version) + 1,
    }

    // Apply field selections
    conflictFields.forEach((field) => {
      const selection = fieldSelections[field as string] || 'local'
      const sourceNote = selection === 'local' ? localNote : remoteNote

      if (
        field === 'projectIds' ||
        field === 'okrIds' ||
        field === 'tags' ||
        field === 'attachmentIds'
      ) {
        // For arrays, merge (union) both versions
        const localArray = (localNote[field] as string[]) || []
        const remoteArray = (remoteNote[field] as string[]) || []
        const mergedArray = Array.from(new Set([...localArray, ...remoteArray]))
        ;(merged[field] as string[]) = mergedArray
      } else if (field === 'content' || field === 'contentHtml') {
        // For content, use the selected version
        merged[field] = sourceNote[field] as string | object
      } else {
        // For other fields, use the selected version
        merged[field] = sourceNote[field] as string | number | string[] | null
      }
    })

    return merged
  }, [selectedVersion, fieldSelections, localNote, remoteNote, conflictFields])

  const renderFieldComparison = (field: keyof Note) => {
    const localValue = localNote[field]
    const remoteValue = remoteNote[field]

    // Skip if values are identical
    if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
      return null
    }

    const isArrayField =
      field === 'projectIds' || field === 'okrIds' || field === 'tags' || field === 'attachmentIds'
    const fieldSelection = fieldSelections[field as string] || 'local'
    const showMergeControls = selectedVersion === 'merge'

    return (
      <div key={field as string} className="conflict-field">
        <div className="conflict-field__header">
          <h4 className="conflict-field__label">
            {field as string}
            {isArrayField && showMergeControls && (
              <span className="conflict-field__merge-note">(will merge both)</span>
            )}
          </h4>
          {showMergeControls && !isArrayField && (
            <div className="conflict-field__choices">
              <button
                type="button"
                onClick={() =>
                  setFieldSelections((prev) => ({ ...prev, [field as string]: 'local' }))
                }
                className={`conflict-field__choice conflict-field__choice--local ${
                  fieldSelection === 'local' ? 'is-active' : ''
                }`}
              >
                Use Local
              </button>
              <button
                type="button"
                onClick={() =>
                  setFieldSelections((prev) => ({ ...prev, [field as string]: 'remote' }))
                }
                className={`conflict-field__choice conflict-field__choice--remote ${
                  fieldSelection === 'remote' ? 'is-active' : ''
                }`}
              >
                Use Remote
              </button>
            </div>
          )}
        </div>

        <div className="conflict-field__grid">
          <div
            className={`conflict-field__panel conflict-field__panel--local ${
              showMergeControls && !isArrayField && fieldSelection === 'local' ? 'is-selected' : ''
            }`}
          >
            <p className="conflict-field__panel-title">Your Version (Local)</p>
            <div className="conflict-field__value">
              {isArrayField ? (
                <ul className="conflict-field__list">
                  {(localValue as string[])?.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              ) : typeof localValue === 'object' && localValue !== null ? (
                <pre className="conflict-field__value">
                  {JSON.stringify(localValue, null, 2).substring(0, 500)}
                  {JSON.stringify(localValue, null, 2).length > 500 ? '...' : ''}
                </pre>
              ) : (
                String(localValue || '')
              )}
            </div>
          </div>

          <div
            className={`conflict-field__panel conflict-field__panel--remote ${
              showMergeControls && !isArrayField && fieldSelection === 'remote' ? 'is-selected' : ''
            }`}
          >
            <p className="conflict-field__panel-title">Server Version (Remote)</p>
            <div className="conflict-field__value">
              {isArrayField ? (
                <ul className="conflict-field__list">
                  {(remoteValue as string[])?.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              ) : typeof remoteValue === 'object' && remoteValue !== null ? (
                <pre className="conflict-field__value">
                  {JSON.stringify(remoteValue, null, 2).substring(0, 500)}
                  {JSON.stringify(remoteValue, null, 2).length > 500 ? '...' : ''}
                </pre>
              ) : (
                String(remoteValue || '')
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="conflict-modal-overlay">
      <div className="conflict-modal">
        {/* Header */}
        <div className="conflict-modal__header">
          <div>
            <h2 className="conflict-modal__title">Sync Conflict Detected</h2>
            <p className="conflict-modal__subtitle">
              This note was modified both locally and on the server. Choose which version to keep.
            </p>
          </div>
          <button onClick={onCancel} className="conflict-modal__close" aria-label="Close">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="conflict-modal__content">
          {/* Version Info */}
          <div className="conflict-version-grid">
            <div className="conflict-version-card conflict-version-card--local">
              <h3 className="conflict-version-title">📱 Your Version (Local)</h3>
              <p className="conflict-version-meta">
                Last modified: {formatDate(localNote.updatedAtMs)}
              </p>
            </div>

            <div className="conflict-version-card conflict-version-card--remote">
              <h3 className="conflict-version-title">☁️ Server Version (Remote)</h3>
              <p className="conflict-version-meta">
                Last modified: {formatDate(remoteNote.updatedAtMs)}
              </p>
            </div>
          </div>

          {/* Conflict Fields */}
          <div>
            <h3 className="conflict-section-title">Conflicting Fields</h3>
            {conflictFields.map((field) => renderFieldComparison(field))}
          </div>

          {/* Resolution Options */}
          <div>
            <h3 className="conflict-section-title">Choose Resolution</h3>

            <div className="conflict-options">
              <label className="conflict-option">
                <input
                  type="radio"
                  name="resolution"
                  value="local"
                  checked={selectedVersion === 'local'}
                  onChange={() => setSelectedVersion('local')}
                />
                <div>
                  <p className="conflict-option__title">Keep Your Version (Local)</p>
                  <p className="conflict-option__desc">
                    Your local changes will override the server version
                  </p>
                </div>
              </label>

              <label className="conflict-option">
                <input
                  type="radio"
                  name="resolution"
                  value="remote"
                  checked={selectedVersion === 'remote'}
                  onChange={() => setSelectedVersion('remote')}
                />
                <div>
                  <p className="conflict-option__title">Keep Server Version (Remote)</p>
                  <p className="conflict-option__desc">
                    The server version will override your local changes
                  </p>
                </div>
              </label>

              <label className="conflict-option">
                <input
                  type="radio"
                  name="resolution"
                  value="merge"
                  checked={selectedVersion === 'merge'}
                  onChange={() => setSelectedVersion('merge')}
                />
                <div>
                  <p className="conflict-option__title">Merge Manually</p>
                  <p className="conflict-option__desc">
                    Select which version to use for each field. Arrays will be merged automatically.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Merge Preview */}
          {selectedVersion === 'merge' && createMergedNote && (
            <div className="conflict-merge-preview">
              <h3 className="conflict-merge-preview__title">📋 Preview of Merged Note</h3>
              <div>
                <div className="conflict-preview-item">
                  <div className="conflict-preview-label">Title:</div>
                  <div className="conflict-preview-value">
                    {createMergedNote.title || '(empty)'}
                  </div>
                </div>

                {createMergedNote.projectIds && createMergedNote.projectIds.length > 0 && (
                  <div className="conflict-preview-item">
                    <div className="conflict-preview-label">Projects:</div>
                    <div className="conflict-preview-value">
                      {createMergedNote.projectIds.join(', ')}
                    </div>
                  </div>
                )}

                {createMergedNote.okrIds && createMergedNote.okrIds.length > 0 && (
                  <div className="conflict-preview-item">
                    <div className="conflict-preview-label">OKRs:</div>
                    <div className="conflict-preview-value">
                      {createMergedNote.okrIds.join(', ')}
                    </div>
                  </div>
                )}

                {createMergedNote.tags && createMergedNote.tags.length > 0 && (
                  <div className="conflict-preview-item">
                    <div className="conflict-preview-label">Tags:</div>
                    <div className="conflict-preview-value">{createMergedNote.tags.join(', ')}</div>
                  </div>
                )}

                {(createMergedNote.content || createMergedNote.contentHtml) && (
                  <div className="conflict-preview-item">
                    <div className="conflict-preview-label">Content Preview:</div>
                    <div className="conflict-preview-content">
                      {createMergedNote.contentHtml ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html:
                              createMergedNote.contentHtml.substring(0, 500) +
                              (createMergedNote.contentHtml.length > 500 ? '...' : ''),
                          }}
                        />
                      ) : createMergedNote.content ? (
                        <pre className="conflict-preview-content">
                          {JSON.stringify(createMergedNote.content, null, 2).substring(0, 500)}
                          {JSON.stringify(createMergedNote.content, null, 2).length > 500
                            ? '...'
                            : ''}
                        </pre>
                      ) : (
                        '(empty)'
                      )}
                    </div>
                  </div>
                )}

                <div className="conflict-preview-item">
                  <div className="conflict-preview-label">Field Sources:</div>
                  <ul className="conflict-source-list">
                    {conflictFields.map((field) => {
                      const selection = fieldSelections[field as string] || 'local'
                      const isArray =
                        field === 'projectIds' ||
                        field === 'okrIds' ||
                        field === 'tags' ||
                        field === 'attachmentIds'
                      return (
                        <li key={field as string}>
                          <span>{field as string}:</span>{' '}
                          {isArray ? 'merged (both)' : selection === 'local' ? 'local' : 'remote'}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="conflict-errors">
            <p className="conflict-errors__title">Validation Errors:</p>
            <ul className="conflict-errors__list">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="conflict-modal__footer">
          <button onClick={onCancel} className="conflict-footer__button">
            Cancel
          </button>
          <button
            onClick={() => {
              // Validate before resolving
              if (selectedVersion === 'merge' && createMergedNote) {
                const validation = validateNote(createMergedNote)
                if (!validation.valid) {
                  setValidationErrors(validation.errors)
                  return
                }
                setValidationErrors([])
                onResolve('merge', createMergedNote)
              } else {
                // Validate the selected version
                const noteToValidate = selectedVersion === 'local' ? localNote : remoteNote
                const validation = validateNote(noteToValidate)
                if (!validation.valid) {
                  setValidationErrors(validation.errors)
                  return
                }
                setValidationErrors([])
                onResolve(selectedVersion)
              }
            }}
            className="conflict-footer__button conflict-footer__button--primary"
            disabled={validationErrors.length > 0}
          >
            Resolve Conflict
          </button>
        </div>
      </div>
    </div>
  )
}
