/**
 * CircleVisualization — compact visual representation of the 5 Dunbar circles
 *
 * Replaces the flat tab filter with a horizontal bar of color-coded segments
 * showing circle name and contact count. Clicking filters by circle.
 */

import { useMemo } from 'react'
import type { Contact, DunbarCircle } from '@lifeos/agents'
import { CIRCLE_LABELS } from '@lifeos/agents'

interface CircleVisualizationProps {
  contacts: Contact[]
  selectedCircle: DunbarCircle | null
  onSelectCircle: (circle: DunbarCircle | null) => void
}

const CIRCLES: DunbarCircle[] = [0, 1, 2, 3, 4]

export function CircleVisualization({
  contacts,
  selectedCircle,
  onSelectCircle,
}: CircleVisualizationProps) {
  const counts = useMemo(() => {
    const c: Record<DunbarCircle, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const contact of contacts) {
      c[contact.circle]++
    }
    return c
  }, [contacts])

  return (
    <div className="circle-viz">
      <button
        className={`circle-viz__all ${selectedCircle === null ? 'circle-viz__all--active' : ''}`}
        onClick={() => onSelectCircle(null)}
      >
        All ({contacts.length})
      </button>
      <div className="circle-viz__rings">
        {CIRCLES.map((circle) => (
          <button
            key={circle}
            className={`circle-viz__ring circle-viz__ring--${circle} ${selectedCircle === circle ? 'circle-viz__ring--active' : ''}`}
            onClick={() => onSelectCircle(circle)}
          >
            <span className="circle-viz__ring-label">{CIRCLE_LABELS[circle]}</span>
            <span className="circle-viz__ring-count">{counts[circle]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
