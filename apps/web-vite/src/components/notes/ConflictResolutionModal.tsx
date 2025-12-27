/**
 * Conflict Resolution Modal
 *
 * Displays conflicts between local and remote versions of a note.
 * Allows user to choose which version to keep or merge manually.
 */

import React, { useState } from 'react'
import type { Note } from '@lifeos/notes'

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

  if (!isOpen) return null

  const { localNote, remoteNote, conflictFields } = conflict

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleString()
  }

  const renderFieldComparison = (field: keyof Note) => {
    const localValue = localNote[field]
    const remoteValue = remoteNote[field]

    // Skip if values are identical
    if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
      return null
    }

    return (
      <div key={field as string} className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {field as string}
        </h4>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
              Your Version (Local)
            </p>
            <div className="text-sm text-gray-700 dark:text-gray-300 break-words">
              {typeof localValue === 'object' && localValue !== null
                ? JSON.stringify(localValue, null, 2)
                : String(localValue)}
            </div>
          </div>

          <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
            <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">
              Server Version (Remote)
            </p>
            <div className="text-sm text-gray-700 dark:text-gray-300 break-words">
              {typeof remoteValue === 'object' && remoteValue !== null
                ? JSON.stringify(remoteValue, null, 2)
                : String(remoteValue)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Sync Conflict Detected
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                This note was modified both locally and on the server. Choose which version to keep.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close"
            >
              <span className="text-2xl">×</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-200px)]">
          {/* Version Info */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                📱 Your Version (Local)
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Last modified: {formatDate(localNote.updatedAtMs)}
              </p>
            </div>

            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
                ☁️ Server Version (Remote)
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Last modified: {formatDate(remoteNote.updatedAtMs)}
              </p>
            </div>
          </div>

          {/* Conflict Fields */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Conflicting Fields
            </h3>
            {conflictFields.map((field) => renderFieldComparison(field))}
          </div>

          {/* Resolution Options */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Choose Resolution
            </h3>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="resolution"
                  value="local"
                  checked={selectedVersion === 'local'}
                  onChange={() => setSelectedVersion('local')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Keep Your Version (Local)
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Your local changes will override the server version
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="resolution"
                  value="remote"
                  checked={selectedVersion === 'remote'}
                  onChange={() => setSelectedVersion('remote')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Keep Server Version (Remote)
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    The server version will override your local changes
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors opacity-50">
                <input
                  type="radio"
                  name="resolution"
                  value="merge"
                  checked={selectedVersion === 'merge'}
                  onChange={() => setSelectedVersion('merge')}
                  className="mt-1"
                  disabled
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Merge Manually (Coming Soon)
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manually combine both versions (not yet implemented)
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onResolve(selectedVersion)}
            disabled={selectedVersion === 'merge'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Resolve Conflict
          </button>
        </div>
      </div>
    </div>
  )
}
