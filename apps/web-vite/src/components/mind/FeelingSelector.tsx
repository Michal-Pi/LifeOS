/**
 * Feeling Selector Component
 *
 * Allows users to select their current emotional state.
 * Used to recommend appropriate interventions.
 */

import type { FeelingState } from '@lifeos/mind'
import { Button } from '@/components/ui/button'

interface FeelingSelectorProps {
  selectedFeeling?: FeelingState
  onSelect: (feeling: FeelingState) => void
}

const FEELINGS: Array<{
  value: FeelingState
  label: string
  description: string
  emoji: string
}> = [
  {
    value: 'anxious',
    label: 'Anxious',
    description: 'Worried, nervous, or on edge',
    emoji: '😰',
  },
  {
    value: 'overwhelmed',
    label: 'Overwhelmed',
    description: 'Too much to handle',
    emoji: '😵',
  },
  {
    value: 'angry',
    label: 'Angry',
    description: 'Frustrated or irritated',
    emoji: '😤',
  },
  {
    value: 'avoidant',
    label: 'Avoidant',
    description: 'Procrastinating or stuck',
    emoji: '😶',
  },
  {
    value: 'restless',
    label: 'Restless',
    description: "Can't settle or focus",
    emoji: '😣',
  },
  {
    value: 'tired',
    label: 'Tired',
    description: 'Low energy or burnt out',
    emoji: '😴',
  },
  {
    value: 'neutral',
    label: 'Just checking in',
    description: "I'm okay, just want to practice",
    emoji: '😌',
  },
]

export function FeelingSelector({ selectedFeeling, onSelect }: FeelingSelectorProps) {
  return (
    <div className="feeling-selector">
      <h3 className="feeling-selector-title">How are you feeling right now?</h3>
      <p className="feeling-selector-subtitle">Select the feeling that best describes your state</p>

      <div className="feeling-grid">
        {FEELINGS.map((feeling) => (
          <Button
            variant="ghost"
            key={feeling.value}
            type="button"
            onClick={() => onSelect(feeling.value)}
            className={`feeling-option ${selectedFeeling === feeling.value ? 'selected' : ''}`}
          >
            <span className="feeling-emoji">{feeling.emoji}</span>
            <span className="feeling-label">{feeling.label}</span>
            <span className="feeling-description">{feeling.description}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
