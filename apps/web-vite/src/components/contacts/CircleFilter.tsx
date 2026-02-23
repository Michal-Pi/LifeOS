/**
 * CircleFilter — tab bar for filtering contacts by Dunbar circle
 */

import type { DunbarCircle } from '@lifeos/agents'
import { CIRCLE_LABELS } from '@lifeos/agents'

interface CircleFilterProps {
  selected: DunbarCircle | undefined
  onChange: (circle: DunbarCircle | undefined) => void
  counts?: Record<DunbarCircle | 'all', number>
}

const CIRCLES: (DunbarCircle | undefined)[] = [undefined, 0, 1, 2, 3, 4]

export function CircleFilter({ selected, onChange, counts }: CircleFilterProps) {
  return (
    <div className="circle-filter">
      {CIRCLES.map((circle) => {
        const label = circle === undefined ? 'All' : CIRCLE_LABELS[circle]
        const count = circle === undefined ? counts?.all : counts?.[circle]
        const isActive = selected === circle

        return (
          <button
            key={circle ?? 'all'}
            className={`circle-filter__btn${isActive ? ' circle-filter__btn--active' : ''}`}
            onClick={() => onChange(circle)}
          >
            {label}
            {count !== undefined && <span className="circle-filter__count">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
