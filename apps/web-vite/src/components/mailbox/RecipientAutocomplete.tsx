/**
 * RecipientAutocomplete Component
 *
 * Autocomplete dropdown for the mailbox composer's "To" field.
 * Sources suggestions from recent message senders and SenderPersona records.
 * Follows the NoteLinkAutocomplete pattern for dropdown UI.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRecipientSuggestions } from '@/hooks/useRecipientSuggestions'
import type { RecipientSuggestion } from '@/hooks/useRecipientSuggestions'
import type { MessageSource } from '@lifeos/agents'
import '@/styles/components/RecipientAutocomplete.css'

const SOURCE_ICONS: Record<MessageSource, string> = {
  gmail: '@',
  slack: '#',
  linkedin: 'in',
  whatsapp: 'W',
  telegram: 'T',
}

interface RecipientAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: RecipientSuggestion) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}

export function RecipientAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Email address or recipient ID',
  disabled = false,
  id,
}: RecipientAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [prevSuggestionsLength, setPrevSuggestionsLength] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { suggestions } = useRecipientSuggestions(value)

  // Reset selection when suggestions change (derived state during render)
  if (prevSuggestionsLength !== suggestions.length) {
    setPrevSuggestionsLength(suggestions.length)
    setSelectedIndex(0)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback(
    (suggestion: RecipientSuggestion) => {
      onSelect(suggestion)
      onChange(suggestion.email ?? suggestion.name)
      setIsOpen(false)
    },
    [onSelect, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) {
        if (e.key === 'ArrowDown' && suggestions.length > 0) {
          e.preventDefault()
          setIsOpen(true)
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
          e.preventDefault()
          if (suggestions[selectedIndex]) {
            handleSelect(suggestions[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          break
      }
    },
    [isOpen, suggestions, selectedIndex, handleSelect]
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
    <div className="recipient-autocomplete">
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="mailbox-composer__input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls={showDropdown ? 'recipient-suggestions' : undefined}
        aria-activedescendant={
          showDropdown && suggestions[selectedIndex]
            ? `recipient-option-${selectedIndex}`
            : undefined
        }
      />

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="recipient-autocomplete__dropdown"
          id="recipient-suggestions"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`recipient-option-${index}`}
              type="button"
              className={`recipient-autocomplete__item ${
                index === selectedIndex ? 'recipient-autocomplete__item--selected' : ''
              }`}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              aria-selected={index === selectedIndex}
            >
              <span
                className={`recipient-autocomplete__source recipient-autocomplete__source--${suggestion.source}`}
              >
                {SOURCE_ICONS[suggestion.source]}
              </span>
              <div className="recipient-autocomplete__info">
                <span className="recipient-autocomplete__name">{suggestion.name}</span>
                {suggestion.email && (
                  <span className="recipient-autocomplete__email">{suggestion.email}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
