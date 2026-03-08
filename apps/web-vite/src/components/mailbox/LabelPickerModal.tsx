import { useState, useMemo, useRef, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { MailboxFilter } from './MailboxStatsBar'
import '@/styles/components/LabelPickerModal.css'

interface LabelPickerModalProps {
  open: boolean
  onClose: () => void
  labels: Array<{ id: string; name: string }>
  activeFilter: MailboxFilter
  onFilterChange: (filter: MailboxFilter) => void
}

export function LabelPickerModal({
  open,
  onClose,
  labels,
  activeFilter,
  onFilterChange,
}: LabelPickerModalProps) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSearch('')
    }
  }

  const activeLabelId =
    activeFilter.type === 'label' ? (activeFilter as { labelId: string }).labelId : null

  const filtered = useMemo(() => {
    if (!search.trim()) return labels
    const q = search.toLowerCase()
    return labels.filter((l) => l.name.toLowerCase().includes(q))
  }, [labels, search])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const handleSelect = (label: { id: string; name: string }) => {
    onFilterChange({ type: 'label', labelName: label.name, labelId: label.id })
    onClose()
  }

  const handleClear = () => {
    onFilterChange({ type: 'all' })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Gmail Labels">
      <div className="label-picker">
        <input
          ref={inputRef}
          type="text"
          className="label-picker__search"
          placeholder="Search labels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {activeLabelId && (
          <button type="button" className="label-picker__clear" onClick={handleClear}>
            Clear label filter
          </button>
        )}

        <div className="label-picker__list">
          {filtered.map((label) => (
            <button
              key={label.id}
              type="button"
              className={`label-picker__item ${activeLabelId === label.id ? 'label-picker__item--active' : ''}`}
              onClick={() => handleSelect(label)}
            >
              <span className="label-picker__check">
                {activeLabelId === label.id ? '\u2713' : ''}
              </span>
              {label.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <span className="label-picker__empty">No labels match "{search}"</span>
          )}
        </div>
      </div>
    </Modal>
  )
}
