/**
 * @fileoverview Horizontal chip selector for meeting duration.
 * Only shown when multiple durations are available.
 */

interface DurationSelectorProps {
  durations: number[]
  selected: number
  onSelect: (duration: number) => void
}

export function DurationSelector({ durations, selected, onSelect }: DurationSelectorProps) {
  if (durations.length <= 1) return null

  return (
    <div className="duration-selector">
      {durations.map((d) => (
        <button
          key={d}
          type="button"
          className={`duration-chip${d === selected ? ' duration-chip--active' : ''}`}
          onClick={() => onSelect(d)}
        >
          {d} min
        </button>
      ))}
    </div>
  )
}
