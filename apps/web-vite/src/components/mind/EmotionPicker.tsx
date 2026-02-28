/**
 * EmotionPicker Component
 *
 * A chip-based core emotion selector.
 * Clicking a core emotion opens a modal to select detailed emotions.
 */

import { useState, useMemo } from 'react'
import type { CoreEmotionId, CoreEmotion, DetailedEmotion } from '@lifeos/mind'
import { FEELINGS_WHEEL, getDetailedEmotionById, getCoreEmotionForDetailed } from '@lifeos/mind'
import { DetailedEmotionModal } from './DetailedEmotionModal'
import '@/styles/components/EmotionPicker.css'

interface EmotionPickerProps {
  selectedEmotionId?: string
  onSelect: (emotionId: string, coreEmotionId: CoreEmotionId) => void
}

const NEUTRAL_ID: CoreEmotionId = 'neutral'

export function EmotionPicker({ selectedEmotionId, onSelect }: EmotionPickerProps) {
  const [selectedCoreEmotion, setSelectedCoreEmotion] = useState<CoreEmotion | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const isNeutral = selectedEmotionId === NEUTRAL_ID

  const selectedDetailed = useMemo(
    () => (selectedEmotionId ? getDetailedEmotionById(selectedEmotionId) : null),
    [selectedEmotionId]
  )

  const selectedCore = useMemo(
    () => (selectedEmotionId ? getCoreEmotionForDetailed(selectedEmotionId) : null),
    [selectedEmotionId]
  )

  const handleCoreClick = (core: CoreEmotion) => {
    if (core.id === NEUTRAL_ID) {
      onSelect(NEUTRAL_ID, NEUTRAL_ID)
      setIsModalOpen(false)
      setSelectedCoreEmotion(null)
      return
    }
    setSelectedCoreEmotion(core)
    setIsModalOpen(true)
  }

  const handleDetailedSelect = (detailed: DetailedEmotion) => {
    onSelect(detailed.id, detailed.coreEmotionId)
    setIsModalOpen(false)
    setSelectedCoreEmotion(null)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedCoreEmotion(null)
  }

  return (
    <div className="emotion-picker">
      <div className="emotion-chip-grid" role="group" aria-label="Emotional state">
        {FEELINGS_WHEEL.map((core) => {
          const isSelected = selectedCore?.id === core.id
          return (
            <button
              key={core.id}
              type="button"
              className={`emotion-chip ${isSelected ? 'active' : ''}`}
              onClick={() => handleCoreClick(core)}
              aria-pressed={isSelected}
              style={
                {
                  '--emotion-color': core.color,
                } as React.CSSProperties
              }
            >
              {core.label}
            </button>
          )
        })}
      </div>

      {isNeutral && (
        <div className="selected-emotion-display neutral">
          <span className="selected-emotion-detail">Neutral</span>
        </div>
      )}

      {!isNeutral && selectedDetailed && selectedCore && (
        <div
          className="selected-emotion-display"
          style={
            {
              '--emotion-color': selectedCore.color,
            } as React.CSSProperties
          }
        >
          <span className="selected-emotion-indicator" />
          <span className="selected-emotion-core">{selectedCore.label}</span>
          <span className="selected-emotion-arrow">→</span>
          <span className="selected-emotion-detail">{selectedDetailed.label}</span>
        </div>
      )}

      <DetailedEmotionModal
        isOpen={isModalOpen}
        coreEmotion={selectedCoreEmotion}
        selectedEmotionId={selectedEmotionId}
        onSelect={handleDetailedSelect}
        onClose={handleModalClose}
      />
    </div>
  )
}
