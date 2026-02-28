/**
 * CircleSuggestionBadge — inline AI circle suggestion in ContactDetail.
 */

import { useState, useCallback } from 'react'
import type { ContactId, DunbarCircle } from '@lifeos/agents'
import { CIRCLE_LABELS } from '@lifeos/agents'
import { suggestCirclePlacement, type CircleSuggestion } from '@/lib/contactAITools'
import { Button } from '@/components/ui/button'

interface CircleSuggestionBadgeProps {
  contactId: ContactId
  currentCircle: DunbarCircle
  onAccept: (circle: DunbarCircle) => void
}

export function CircleSuggestionBadge({
  contactId,
  currentCircle,
  onAccept,
}: CircleSuggestionBadgeProps) {
  const [suggestion, setSuggestion] = useState<CircleSuggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const fetchSuggestion = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDismissed(false)
    try {
      const result = await suggestCirclePlacement(contactId)
      setSuggestion(result)
    } catch (err) {
      console.error('Failed to get circle suggestion:', err)
      setError((err as Error).message || 'Failed to generate suggestion')
    } finally {
      setLoading(false)
    }
  }, [contactId])

  // Show "Suggest circle" button when no suggestion loaded
  if (!suggestion && !loading && !error) {
    return (
      <Button variant="ghost" className="small" onClick={fetchSuggestion}>
        Suggest circle
      </Button>
    )
  }

  if (loading) {
    return <span className="circle-suggestion__loading">Analyzing...</span>
  }

  if (error) {
    return (
      <span className="circle-suggestion__error">
        {error}{' '}
        <button className="circle-suggestion__retry" onClick={fetchSuggestion}>
          Retry
        </button>
      </span>
    )
  }

  if (!suggestion || dismissed) return null

  // Don't show if suggestion matches current circle
  if (suggestion.suggestedCircle === currentCircle) {
    return (
      <span className="circle-suggestion__match">
        AI confirms: {CIRCLE_LABELS[currentCircle]} is correct
      </span>
    )
  }

  const suggestedLabel = CIRCLE_LABELS[suggestion.suggestedCircle as DunbarCircle]

  return (
    <div className="circle-suggestion">
      <div className="circle-suggestion__content">
        <span className="circle-suggestion__label">
          AI suggests: <strong>{suggestedLabel}</strong>
        </span>
        <span
          className={`circle-suggestion__confidence circle-suggestion__confidence--${suggestion.confidence}`}
        >
          {suggestion.confidence}
        </span>
      </div>
      <p className="circle-suggestion__reasoning">{suggestion.reasoning}</p>
      <div className="circle-suggestion__actions">
        <Button
          variant="ghost"
          className="small"
          onClick={() => onAccept(suggestion.suggestedCircle as DunbarCircle)}
        >
          Accept
        </Button>
        <Button variant="ghost" className="small" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
