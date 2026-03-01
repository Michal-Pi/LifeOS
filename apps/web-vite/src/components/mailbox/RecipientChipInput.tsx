/**
 * RecipientChipInput Component
 *
 * Gmail-style multi-recipient chip input for the mailbox composer.
 * Shows selected recipients as removable chips with channel icons.
 * Typing triggers CRM-backed autocomplete suggestions.
 *
 * Keyboard: Enter/Tab to select, Backspace to remove, Arrow keys to navigate, Escape to close.
 * Accessibility: ARIA combobox pattern with listbox, activedescendant.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useContactRecipients } from '@/hooks/useContactRecipients'
import type { Recipient } from '@lifeos/agents'
import type { MessageSource } from '@lifeos/agents'
import '@/styles/components/RecipientChipInput.css'

const SOURCE_ICONS: Record<MessageSource, string> = {
  gmail: '@',
  slack: '#',
  linkedin: 'in',
  whatsapp: 'W',
  telegram: 'T',
}

interface RecipientChipInputProps {
  /** Currently selected recipients */
  recipients: Recipient[]
  /** Called when recipients change (add/remove) */
  onChange: (recipients: Recipient[]) => void
  /** Current channel for filtering contact availability */
  channel: MessageSource
  /** Placeholder text */
  placeholder?: string
  /** Whether the field is disabled */
  disabled?: boolean
  /** HTML id for label association */
  id?: string
}

export function RecipientChipInput({
  recipients,
  onChange,
  channel,
  placeholder = 'Type a name or email...',
  disabled = false,
  id,
}: RecipientChipInputProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const excludeIds = useMemo(() => recipients.map((r) => r.id), [recipients])

  const { suggestions } = useContactRecipients({
    channel,
    queryText: query,
    excludeIds,
  })

  // Reset selection when suggestions change (React-idiomatic "adjust state during render")
  const [prevSuggestionsLen, setPrevSuggestionsLen] = useState(suggestions.length)
  if (prevSuggestionsLen !== suggestions.length) {
    setPrevSuggestionsLen(suggestions.length)
    setSelectedIndex(0)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback(
    (suggestion: Recipient) => {
      onChange([...recipients, suggestion])
      setQuery('')
      setIsOpen(false)
      inputRef.current?.focus()
    },
    [recipients, onChange]
  )

  const handleRemove = useCallback(
    (index: number) => {
      const updated = recipients.filter((_, i) => i !== index)
      onChange(updated)
      inputRef.current?.focus()
    },
    [recipients, onChange]
  )

  /**
   * Add a raw email/ID as a recipient when no suggestion is selected.
   * Only adds if the input looks like a valid email.
   */
  const handleAddRaw = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      // Only accept raw input that looks like an email or identifier
      if (!trimmed.includes('@') && !trimmed.includes('.')) return
      // Don't add duplicates
      if (recipients.some((r) => r.id === trimmed)) return

      onChange([
        ...recipients,
        {
          id: trimmed,
          name: trimmed,
          email: trimmed.includes('@') ? trimmed : undefined,
          channel,
        },
      ])
      setQuery('')
      setIsOpen(false)
    },
    [recipients, onChange, channel]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !query && recipients.length > 0) {
        e.preventDefault()
        handleRemove(recipients.length - 1)
        return
      }

      if (!isOpen || suggestions.length === 0) {
        if (e.key === 'ArrowDown' && suggestions.length > 0) {
          e.preventDefault()
          setIsOpen(true)
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && query.trim()) {
          e.preventDefault()
          handleAddRaw(query)
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % suggestions.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          if (suggestions[selectedIndex]) {
            handleSelect(suggestions[selectedIndex])
          } else if (query.trim()) {
            handleAddRaw(query)
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          break
      }
    },
    [isOpen, suggestions, selectedIndex, query, recipients, handleSelect, handleRemove, handleAddRaw]
  )

  // Scroll selected item into view
  useEffect(() => {
    if (dropdownRef.current && selectedIndex >= 0) {
      const selectedItem = dropdownRef.current.children[selectedIndex] as HTMLElement
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  const showDropdown = isOpen && suggestions.length > 0

  return (
    <div className="recipient-chip-input" ref={wrapperRef}>
      <div
        className={`recipient-chip-input__wrapper${disabled ? ' recipient-chip-input__wrapper--disabled' : ''}`}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {/* Selected recipient chips */}
        {recipients.map((recipient, index) => (
          <span key={`${recipient.id}-${index}`} className="recipient-chip">
            <span className={`recipient-chip__icon recipient-chip__icon--${recipient.channel ?? channel}`}>
              {SOURCE_ICONS[recipient.channel ?? channel]}
            </span>
            <span className="recipient-chip__name">{recipient.name}</span>
            {!disabled && (
              <button
                type="button"
                className="recipient-chip__remove"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(index)
                }}
                aria-label={`Remove ${recipient.name}`}
                tabIndex={-1}
              >
                ×
              </button>
            )}
          </span>
        ))}

        {/* Inline input */}
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="recipient-chip-input__input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (query || suggestions.length > 0) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={recipients.length === 0 ? placeholder : ''}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls={showDropdown ? 'recipient-chip-suggestions' : undefined}
          aria-activedescendant={
            showDropdown && suggestions[selectedIndex]
              ? `recipient-chip-option-${selectedIndex}`
              : undefined
          }
        />
      </div>

      {/* Suggestion dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="recipient-chip-input__dropdown"
          id="recipient-chip-suggestions"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`recipient-chip-option-${index}`}
              type="button"
              className={`recipient-chip-input__item${
                index === selectedIndex ? ' recipient-chip-input__item--selected' : ''
              }`}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              aria-selected={index === selectedIndex}
            >
              <span
                className={`recipient-chip-input__item-icon recipient-chip-input__item-icon--${suggestion.channel ?? channel}`}
              >
                {SOURCE_ICONS[suggestion.channel ?? channel]}
              </span>
              <div className="recipient-chip-input__item-info">
                <span className="recipient-chip-input__item-name">{suggestion.name}</span>
                {suggestion.email && (
                  <span className="recipient-chip-input__item-detail">{suggestion.email}</span>
                )}
                {!suggestion.email && suggestion.id !== suggestion.name && (
                  <span className="recipient-chip-input__item-detail">{suggestion.id}</span>
                )}
              </div>
              {suggestion.contactId && (
                <span className="recipient-chip-input__item-badge">CRM</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
