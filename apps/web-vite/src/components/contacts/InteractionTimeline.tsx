/**
 * InteractionTimeline — chronological list of interactions for a contact
 */

import type { Interaction, InteractionType } from '@lifeos/agents'

interface InteractionTimelineProps {
  interactions: Interaction[]
}

const TYPE_ICONS: Record<InteractionType, string> = {
  email: '\u2709',
  meeting: '\uD83D\uDCC5',
  call: '\uD83D\uDCDE',
  message: '\uD83D\uDCAC',
  note: '\uD83D\uDCDD',
  social: '\uD83C\uDF10',
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - ms) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return (
      <div className="interaction-timeline__empty">
        No interactions recorded yet.
      </div>
    )
  }

  return (
    <div className="interaction-timeline">
      {interactions.map((interaction) => (
        <div key={interaction.interactionId} className="interaction-timeline__item">
          <span className="interaction-timeline__icon">
            {TYPE_ICONS[interaction.type] ?? '\u2022'}
          </span>
          <div className="interaction-timeline__content">
            <div className="interaction-timeline__summary">{interaction.summary}</div>
            {interaction.details && (
              <div className="interaction-timeline__details">{interaction.details}</div>
            )}
            {interaction.meetingInsights && interaction.meetingInsights.length > 0 && (
              <ul className="interaction-timeline__insights">
                {interaction.meetingInsights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            )}
          </div>
          <span className="interaction-timeline__date">
            {formatDate(interaction.occurredAtMs)}
          </span>
        </div>
      ))}
    </div>
  )
}
