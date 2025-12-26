/**
 * Export Menu Component
 *
 * Dropdown menu for exporting notes to various formats.
 * Provides options to:
 * - Export to Markdown file
 * - Export to plain text file
 * - Copy as Markdown to clipboard
 * - Copy as plain text to clipboard
 */

import { useState, useRef, useEffect } from 'react'
import type { Note } from '@lifeos/notes'
import { downloadNote, copyNoteToClipboard } from '@/lib/noteExport'

export interface ExportMenuProps {
  note: Note
  className?: string
}

export function ExportMenu({ note, className = '' }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleDownloadMarkdown = () => {
    downloadNote(note, 'markdown')
    setIsOpen(false)
  }

  const handleDownloadText = () => {
    downloadNote(note, 'text')
    setIsOpen(false)
  }

  const handleCopyMarkdown = async () => {
    try {
      await copyNoteToClipboard(note, 'markdown')
      setCopyStatus('Copied as Markdown!')
      setTimeout(() => setCopyStatus(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      setCopyStatus('Failed to copy')
      setTimeout(() => setCopyStatus(null), 2000)
    }
    setIsOpen(false)
  }

  const handleCopyText = async () => {
    try {
      await copyNoteToClipboard(note, 'text')
      setCopyStatus('Copied as text!')
      setTimeout(() => setCopyStatus(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      setCopyStatus('Failed to copy')
      setTimeout(() => setCopyStatus(null), 2000)
    }
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* Export Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors"
        aria-label="Export note"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <span>↓</span>
          <span>Export</span>
        </span>
      </button>

      {/* Copy Status Toast */}
      {copyStatus && (
        <div className="absolute top-full mt-2 left-0 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-900 dark:text-green-100 whitespace-nowrap z-50">
          {copyStatus}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-1 right-0 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="py-1">
            {/* Download as Markdown */}
            <button
              onClick={handleDownloadMarkdown}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
            >
              <span className="text-lg">📄</span>
              <div>
                <p className="font-medium">Download as Markdown</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Save as .md file</p>
              </div>
            </button>

            {/* Download as Text */}
            <button
              onClick={handleDownloadText}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
            >
              <span className="text-lg">📝</span>
              <div>
                <p className="font-medium">Download as Text</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Save as .txt file</p>
              </div>
            </button>

            <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

            {/* Copy as Markdown */}
            <button
              onClick={handleCopyMarkdown}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
            >
              <span className="text-lg">📋</span>
              <div>
                <p className="font-medium">Copy as Markdown</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Copy to clipboard</p>
              </div>
            </button>

            {/* Copy as Text */}
            <button
              onClick={handleCopyText}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
            >
              <span className="text-lg">📄</span>
              <div>
                <p className="font-medium">Copy as Text</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Plain text to clipboard</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
