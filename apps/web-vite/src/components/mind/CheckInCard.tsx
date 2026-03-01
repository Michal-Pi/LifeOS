/**
 * CheckInCard Component
 *
 * Time-aware daily check-in card with:
 * - Left column: Energy Level picker (Low/Medium/High)
 * - Right column: Emotion chip picker
 *
 * Automatically shows "Morning Check-In", "Afternoon Check-In", or "Evening Check-In"
 * based on current time.
 */

import { useState, useCallback, useEffect } from 'react'
import { createLogger } from '@lifeos/core'
import type { EnergyLevel, CoreEmotionId } from '@lifeos/mind'
import { useCheckIn } from '@/hooks/useCheckIn'
import { EmotionPicker } from './EmotionPicker'
import { CheckInHistoryModal } from './CheckInHistoryModal'
import { Button } from '@/components/ui/button'
import { getEmotionLabel, getCoreEmotionById } from '@lifeos/mind'
import '@/styles/components/CheckInCard.css'

const logger = createLogger('CheckInCard')

interface CheckInCardProps {
  userId: string
  dateKey: string
  onRequestIntervention?: () => void
}

const ENERGY_LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export function CheckInCard({ userId, dateKey, onRequestIntervention }: CheckInCardProps) {
  const {
    currentCheckIn,
    checkInLabel,
    loading,
    saveCheckIn,
    hasCheckedInForPeriod,
    recentHistory,
    historyLoading,
    loadRecentHistory,
  } = useCheckIn({
    userId,
    dateKey,
  })

  const [selectedEnergy, setSelectedEnergy] = useState<EnergyLevel>(
    currentCheckIn?.energyLevel || 'medium'
  )
  const [selectedEmotionId, setSelectedEmotionId] = useState<string | undefined>(
    currentCheckIn?.emotionId
  )
  const [selectedCoreEmotionId, setSelectedCoreEmotionId] = useState<CoreEmotionId | undefined>(
    currentCheckIn?.coreEmotionId
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)

  // Sync state when currentCheckIn changes
  useEffect(() => {
    if (currentCheckIn) {
      setSelectedEnergy(currentCheckIn.energyLevel)
      setSelectedEmotionId(currentCheckIn.emotionId)
      setSelectedCoreEmotionId(currentCheckIn.coreEmotionId)
    }
  }, [currentCheckIn])

  const handleEnergyChange = useCallback((level: EnergyLevel) => {
    setSelectedEnergy(level)
  }, [])

  const handleEmotionSelect = useCallback((emotionId: string, coreEmotionId: CoreEmotionId) => {
    setSelectedEmotionId(emotionId)
    setSelectedCoreEmotionId(coreEmotionId)
  }, [])

  const handleSave = useCallback(async () => {
    if (!selectedEmotionId || !selectedCoreEmotionId) return

    setIsSaving(true)
    try {
      await saveCheckIn(selectedEnergy, selectedEmotionId, selectedCoreEmotionId)
    } catch (err) {
      logger.error('Failed to save check-in:', err)
    } finally {
      setIsSaving(false)
    }
  }, [selectedEnergy, selectedEmotionId, selectedCoreEmotionId, saveCheckIn])

  const handleOpenHistory = useCallback(async () => {
    setIsHistoryModalOpen(true)
    await loadRecentHistory(14) // Load last 14 days
  }, [loadRecentHistory])

  const handleCloseHistory = useCallback(() => {
    setIsHistoryModalOpen(false)
  }, [])

  const canSave = selectedEmotionId && selectedCoreEmotionId && !isSaving

  // Get display info for checked-in status
  const checkedInCore = currentCheckIn?.coreEmotionId
    ? getCoreEmotionById(currentCheckIn.coreEmotionId)
    : null

  return (
    <section className="checkin-card today-card">
      <div className="today-card-header">
        <div>
          <p className="section-label">{checkInLabel}</p>
          <p className="section-hint">Track your energy and emotional state.</p>
        </div>
        {hasCheckedInForPeriod && currentCheckIn && checkedInCore && (
          <div className="checkin-status">
            <span className="checkin-status-dot" style={{ backgroundColor: checkedInCore.color }} />
            <span className="checkin-status-text">{getEmotionLabel(currentCheckIn.emotionId)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="checkin-loading">
          <p>Loading...</p>
        </div>
      ) : (
        <div className="checkin-card-inner">
          {/* Left Column: Energy Level */}
          <div className="checkin-energy-section">
            <div className="checkin-subsection-header">
              <p className="section-label">Energy Level</p>
              <p className="section-hint">How's your energy right now?</p>
            </div>
            <div className="energy-toggle-group" role="group" aria-label="Energy level">
              {ENERGY_LEVELS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`energy-toggle ${selectedEnergy === value ? 'active' : ''}`}
                  onClick={() => handleEnergyChange(value)}
                  aria-pressed={selectedEnergy === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Emotion Chips */}
          <div className="checkin-emotion-section">
            <div className="checkin-subsection-header">
              <p className="section-label">Emotional State</p>
              <p className="section-hint">Pick a core emotion to explore details</p>
            </div>
            <EmotionPicker selectedEmotionId={selectedEmotionId} onSelect={handleEmotionSelect} />
          </div>
        </div>
      )}

      <div className="checkin-actions">
        <Button variant="ghost" className="small" onClick={handleOpenHistory}>
          See History
        </Button>
        {onRequestIntervention && (
          <Button variant="ghost" className="small" onClick={onRequestIntervention}>
            Mind Reset
          </Button>
        )}
        <Button className="primary-button small" onClick={handleSave} disabled={!canSave}>
          {isSaving ? 'Saving...' : hasCheckedInForPeriod ? 'Update' : 'Save Check-In'}
        </Button>
      </div>

      {/* History Modal */}
      <CheckInHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={handleCloseHistory}
        checkIns={historyLoading ? [] : recentHistory}
      />
    </section>
  )
}
