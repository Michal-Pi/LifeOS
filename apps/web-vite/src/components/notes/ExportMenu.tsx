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
    <div className={`export-menu ${className}`} ref={menuRef}>
      {/* Export Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="export-button"
        aria-label="Export note"
        aria-expanded={isOpen}
      >
        <span className="export-button__content">
          <span>↓</span>
          <span>Export</span>
        </span>
      </button>

      {/* Copy Status Toast */}
      {copyStatus && <div className="export-toast">{copyStatus}</div>}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="export-dropdown">
          <div className="export-dropdown__list">
            {/* Download as Markdown */}
            <button onClick={handleDownloadMarkdown} className="export-item">
              <span className="export-item-icon">📄</span>
              <div className="export-item-meta">
                <p className="export-item-title">Download as Markdown</p>
                <span>Save as .md file</span>
              </div>
            </button>

            {/* Download as Text */}
            <button onClick={handleDownloadText} className="export-item">
              <span className="export-item-icon">📝</span>
              <div className="export-item-meta">
                <p className="export-item-title">Download as Text</p>
                <span>Save as .txt file</span>
              </div>
            </button>

            <div className="export-divider"></div>

            {/* Copy as Markdown */}
            <button onClick={handleCopyMarkdown} className="export-item">
              <span className="export-item-icon">📋</span>
              <div className="export-item-meta">
                <p className="export-item-title">Copy as Markdown</p>
                <span>Copy to clipboard</span>
              </div>
            </button>

            {/* Copy as Text */}
            <button onClick={handleCopyText} className="export-item">
              <span className="export-item-icon">📄</span>
              <div className="export-item-meta">
                <p className="export-item-title">Copy as Text</p>
                <span>Plain text to clipboard</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
