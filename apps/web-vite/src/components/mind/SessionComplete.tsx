/**
 * Session Complete Component
 *
 * Shown after completing an intervention.
 * Allows users to select how they feel now and optionally create a next action.
 */

import { useState } from 'react'
import type { FeelingState } from '@lifeos/mind'

interface SessionCompleteProps {
  onFinish: (feelingAfter?: FeelingState, createTodo?: boolean) => void
}

const FEELINGS: Array<{
  value: FeelingState
  label: string
  emoji: string
}> = [
  { value: 'anxious', label: 'Still anxious', emoji: '😰' },
  { value: 'overwhelmed', label: 'Still overwhelmed', emoji: '😵' },
  { value: 'angry', label: 'Still angry', emoji: '😤' },
  { value: 'avoidant', label: 'Still avoidant', emoji: '😶' },
  { value: 'restless', label: 'Still restless', emoji: '😣' },
  { value: 'tired', label: 'Still tired', emoji: '😴' },
  { value: 'neutral', label: 'Feeling better', emoji: '😌' },
]

export function SessionComplete({ onFinish }: SessionCompleteProps) {
  const [feelingAfter, setFeelingAfter] = useState<FeelingState | undefined>(undefined)
  const [createTodo, setCreateTodo] = useState(false)

  return (
    <div className="session-complete">
      <div className="session-complete-header">
        <div className="complete-icon">✓</div>
        <h3 className="session-complete-title">Great work!</h3>
        <p className="session-complete-subtitle">
          You just completed an intervention. You showed up for yourself.
        </p>
      </div>

      <div className="session-complete-body">
        <h4 className="section-label">How are you feeling now?</h4>
        <div className="feeling-after-grid">
          {FEELINGS.map((feeling) => (
            <button
              key={feeling.value}
              type="button"
              onClick={() => setFeelingAfter(feeling.value)}
              className={`feeling-after-option ${feelingAfter === feeling.value ? 'selected' : ''}`}
            >
              <span className="feeling-emoji">{feeling.emoji}</span>
              <span className="feeling-label">{feeling.label}</span>
            </button>
          ))}
        </div>

        <div className="next-action-section">
          <h4 className="section-label">What's your next action?</h4>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={createTodo}
              onChange={(e) => setCreateTodo(e.target.checked)}
            />
            <span>Create a todo for my next right action</span>
          </label>
          <p className="next-action-hint">
            One small step in the direction of your values can build momentum
          </p>
        </div>
      </div>

      <div className="session-complete-footer">
        <button type="button" onClick={() => onFinish(feelingAfter, createTodo)} className="btn-primary">
          Finish
        </button>
        <button
          type="button"
          onClick={() => onFinish(undefined, false)}
          className="btn-secondary"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
