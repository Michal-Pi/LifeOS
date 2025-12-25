'use client'

interface UnifiedViewToggleProps {
  isUnified: boolean
  onToggle: (unified: boolean) => void
  compositeCount?: number
  disabled?: boolean
}

/**
 * Toggle between unified view (composites) and canonical view (individual events)
 */
export function UnifiedViewToggle({
  isUnified,
  onToggle,
  compositeCount = 0,
  disabled = false
}: UnifiedViewToggleProps) {
  return (
    <div className="unified-view-toggle">
      <label className="toggle-label">
        <span className="toggle-text">Unified View</span>
        <button
          type="button"
          className={`toggle-button ${isUnified ? 'on' : 'off'} ${disabled ? 'disabled' : ''}`}
          onClick={() => !disabled && onToggle(!isUnified)}
          disabled={disabled}
          aria-checked={isUnified}
          role="switch"
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </button>
      </label>
      {isUnified && compositeCount > 0 && (
        <span className="composite-count">
          {compositeCount} merged event{compositeCount !== 1 ? 's' : ''}
        </span>
      )}
      {!isUnified && (
        <span className="view-mode-hint">
          Showing all events individually
        </span>
      )}
    </div>
  )
}

