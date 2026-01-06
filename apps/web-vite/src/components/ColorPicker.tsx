import { useState } from 'react'
import './ColorPicker.css'

interface ColorPickerProps {
  colors: string[]
  selectedColor?: string
  onChange: (color: string) => void
  label?: string
}

export function ColorPicker({ colors, selectedColor, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="color-picker">
      {label && <label className="color-picker-label">{label}</label>}
      <button
        type="button"
        className="color-picker-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderColor: selectedColor || 'var(--border)' }}
      >
        <div
          className="color-picker-preview"
          style={{ backgroundColor: selectedColor || 'transparent' }}
        />
        <span>{selectedColor ? 'Color selected' : 'Choose color'}</span>
      </button>

      {isOpen && (
        <div className="color-picker-dropdown">
          <div className="color-picker-grid">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-picker-swatch ${selectedColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onChange(color)
                  setIsOpen(false)
                }}
                title={color}
              >
                {selectedColor === color && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M13 4L6 11L3 8"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
          {selectedColor && (
            <button
              type="button"
              className="color-picker-clear"
              onClick={() => {
                onChange('')
                setIsOpen(false)
              }}
            >
              Clear color
            </button>
          )}
        </div>
      )}
    </div>
  )
}
