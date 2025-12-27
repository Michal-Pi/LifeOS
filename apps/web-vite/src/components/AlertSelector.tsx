'use client'

import type { CanonicalAlert } from '@lifeos/calendar'
import { ALERT_PRESETS, describeAlert } from '@lifeos/calendar'
import { useState } from 'react'

interface AlertSelectorProps {
  currentAlert: CanonicalAlert | null
  onAlertChange: (alert: CanonicalAlert | null) => void
  disabled?: boolean
  isAllDay?: boolean
}

export function AlertSelector({
  currentAlert,
  onAlertChange,
  disabled = false,
  isAllDay = false,
}: AlertSelectorProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [customMinutes, setCustomMinutes] = useState(
    currentAlert &&
      !ALERT_PRESETS.slice(0, -1).some((p) => p.minutesBefore === currentAlert.minutesBefore)
      ? String(currentAlert.minutesBefore)
      : ''
  )

  // Find current preset index
  const currentPresetIndex = currentAlert
    ? ALERT_PRESETS.findIndex((p) => p.minutesBefore === currentAlert.minutesBefore)
    : 0 // "None"

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value, 10)

    if (value === -1) {
      // None
      onAlertChange(null)
      setShowCustom(false)
    } else if (value === -2) {
      // Custom
      setShowCustom(true)
    } else {
      // Preset value
      onAlertChange({
        method: 'in_app_banner',
        minutesBefore: value,
        enabled: true,
      })
      setShowCustom(false)
    }
  }

  const handleCustomSubmit = () => {
    const minutes = parseInt(customMinutes, 10)
    if (!isNaN(minutes) && minutes >= 0) {
      onAlertChange({
        method: 'in_app_banner',
        minutesBefore: minutes,
        enabled: true,
      })
      setShowCustom(false)
    }
  }

  // If all-day event, show a message that alerts aren't supported
  if (isAllDay) {
    return (
      <div className="alert-selector">
        <span className="section-label">Alert</span>
        <p className="alert-not-supported">Alerts are not available for all-day events</p>
      </div>
    )
  }

  return (
    <div className="alert-selector">
      <span className="section-label">Alert</span>

      <div className="alert-select-row">
        <select
          className="alert-select"
          value={
            showCustom
              ? -2
              : currentPresetIndex >= 0
                ? ALERT_PRESETS[currentPresetIndex].minutesBefore
                : -1
          }
          onChange={handlePresetChange}
          disabled={disabled}
        >
          {ALERT_PRESETS.map((preset) => (
            <option key={preset.minutesBefore} value={preset.minutesBefore}>
              {preset.label}
            </option>
          ))}
        </select>

        {currentAlert && currentAlert.enabled && (
          <span className="alert-status enabled" title="Alert enabled">
            🔔
          </span>
        )}
      </div>

      {showCustom && (
        <div className="alert-custom-row">
          <input
            type="number"
            className="alert-custom-input"
            placeholder="Minutes"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            min="0"
            max="10080" // 1 week
          />
          <span className="alert-custom-label">minutes before</span>
          <button
            type="button"
            className="alert-custom-button"
            onClick={handleCustomSubmit}
            disabled={!customMinutes || parseInt(customMinutes, 10) < 0}
          >
            Set
          </button>
        </div>
      )}

      {currentAlert && currentAlert.enabled && (
        <p className="alert-description">{describeAlert(currentAlert)}</p>
      )}

      <p className="alert-hint">💡 Alerts only work while the app is open</p>
    </div>
  )
}
