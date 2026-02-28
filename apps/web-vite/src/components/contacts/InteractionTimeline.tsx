/**
 * InteractionTimeline — visual vertical timeline of interactions for a contact
 *
 * Shows a connected dot-and-line timeline with type-specific colors
 * and relative dates.
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

function formatRelative(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - ms) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return <div className="interaction-timeline__empty">No interactions recorded yet.</div>
  }

  return (
    <div className="interaction-timeline">
      {interactions.map((interaction, i) => (
        <div key={interaction.interactionId} className="timeline-entry">
          <div className="timeline-entry__line">
            <span className={`timeline-entry__dot timeline-entry__dot--${interaction.type}`} />
            {i < interactions.length - 1 && <span className="timeline-entry__connector" />}
          </div>
          <div className="timeline-entry__content">
            <div className="timeline-entry__header">
              <span className="timeline-entry__icon">
                {TYPE_ICONS[interaction.type] ?? '\u2022'}
              </span>
              <span className="timeline-entry__date">
                {formatRelative(interaction.occurredAtMs)}
              </span>
            </div>
            <p className="timeline-entry__summary">{interaction.summary}</p>
            {interaction.details && (
              <p className="timeline-entry__details">{interaction.details}</p>
            )}
            {interaction.meetingInsights && interaction.meetingInsights.length > 0 && (
              <ul className="timeline-entry__insights">
                {interaction.meetingInsights.map((insight, j) => (
                  <li key={j}>{insight}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
