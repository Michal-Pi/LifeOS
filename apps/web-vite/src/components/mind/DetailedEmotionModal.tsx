/**
 * DetailedEmotionModal Component
 *
 * Modal that displays detailed emotions from the outer ring of the feelings wheel
 * for a selected core emotion.
 */

import { useEffect, useRef } from 'react'
import type { CoreEmotion, DetailedEmotion } from '@lifeos/mind'
import '@/styles/components/DetailedEmotionModal.css'

interface DetailedEmotionModalProps {
  isOpen: boolean
  coreEmotion: CoreEmotion | null
  selectedEmotionId?: string
  onSelect: (emotion: DetailedEmotion) => void
  onClose: () => void
}

export function DetailedEmotionModal({
  isOpen,
  coreEmotion,
  selectedEmotionId,
  onSelect,
  onClose,
}: DetailedEmotionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen || !coreEmotion) return null

  return (
    <div className="detailed-emotion-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="detailed-emotion-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        style={
          {
            '--emotion-color': coreEmotion.color,
          } as React.CSSProperties
        }
      >
        <div className="detailed-emotion-modal-header">
          <h2 className="detailed-emotion-modal-title">{coreEmotion.label}</h2>
          <p className="detailed-emotion-modal-subtitle">Select how you feel more specifically</p>
          <button className="detailed-emotion-modal-close" onClick={onClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="detailed-emotion-grid">
          {coreEmotion.detailedEmotions.map((emotion) => (
            <button
              key={emotion.id}
              className={`detailed-emotion-item ${selectedEmotionId === emotion.id ? 'selected' : ''}`}
              onClick={() => onSelect(emotion)}
            >
              {emotion.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
