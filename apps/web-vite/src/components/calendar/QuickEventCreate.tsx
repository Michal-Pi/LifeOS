/**
 * QuickEventCreate — Popover for creating events from empty time slots.
 * Appears when clicking an empty hour slot in DailyView or WeeklyView.
 */

import { useRef, useState, useEffect, useCallback } from 'react'

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export interface QuickEventCreateProps {
  startTime: Date
  endTime: Date
  position: { top: number; left: number }
  onSave: (data: { title: string; startMs: number; endMs: number }) => void
  onMoreOptions: (data: { title: string; startMs: number; endMs: number }) => void
  onClose: () => void
}

export function QuickEventCreate({
  startTime,
  endTime,
  position,
  onSave,
  onMoreOptions,
  onClose,
}: QuickEventCreateProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('')

  // Auto-focus the input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Click-outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const buildPayload = useCallback(() => {
    return {
      title: title.trim() || 'Untitled event',
      startMs: startTime.getTime(),
      endMs: endTime.getTime(),
    }
  }, [title, startTime, endTime])

  const handleSave = () => {
    onSave(buildPayload())
  }

  const handleMoreOptions = () => {
    onMoreOptions(buildPayload())
  }

  return (
    <div
      ref={containerRef}
      className="quick-event"
      style={{ top: position.top, left: position.left }}
    >
      <input
        ref={inputRef}
        className="quick-event__title"
        placeholder="Event title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') onClose()
        }}
      />
      <div className="quick-event__time">
        {timeFormatter.format(startTime)} — {timeFormatter.format(endTime)}
      </div>
      <div className="quick-event__actions">
        <button className="ghost-button" type="button" onClick={handleMoreOptions}>
          More options
        </button>
        <button className="primary-button" type="button" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  )
}
