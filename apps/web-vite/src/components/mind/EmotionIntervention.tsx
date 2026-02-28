/**
 * EmotionIntervention Component
 *
 * Displays cognitive reframe and somatic intervention guidance
 * when a challenging emotion is selected.
 */

import type { EmotionDefinition } from '@lifeos/mind'
import { Button } from '@/components/ui/button'
import '@/styles/components/EmotionIntervention.css'

interface EmotionInterventionProps {
  emotion: EmotionDefinition
  onDismiss: () => void
  onStartFullIntervention?: () => void // Optional: link to MindInterventionModal
}

export function EmotionIntervention({
  emotion,
  onDismiss,
  onStartFullIntervention,
}: EmotionInterventionProps) {
  const hasReframe = !!emotion.reframe
  const hasSomatic = !!emotion.somatic

  if (!hasReframe && !hasSomatic) {
    return null
  }

  return (
    <div className="emotion-intervention">
      <div className="emotion-intervention-header">
        <div className="emotion-intervention-title">
          <span className="emotion-intervention-emoji">{emotion.emoji}</span>
          <span>Support for {emotion.label}</span>
        </div>
      </div>

      <div className="emotion-intervention-content">
        {hasReframe && (
          <div className="intervention-section">
            <p className="section-label">Reframe</p>
            <p className="intervention-text">{emotion.reframe}</p>
          </div>
        )}

        {hasSomatic && (
          <div className="intervention-section">
            <p className="section-label">Somatic Exercise</p>
            <p className="intervention-text">{emotion.somatic}</p>
          </div>
        )}
      </div>

      <div className="emotion-intervention-actions">
        <Button variant="ghost" className="small" onClick={onDismiss}>
          Got it
        </Button>
        {onStartFullIntervention && (
          <Button variant="ghost" className="small" onClick={onStartFullIntervention}>
            Start guided session
          </Button>
        )}
      </div>
    </div>
  )
}
