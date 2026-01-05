interface SegmentedControlOption {
  value: string
  label: string
}

interface SegmentedControlProps {
  value: string
  onChange: (value: string) => void
  options: SegmentedControlOption[]
  className?: string
}

export function SegmentedControl({
  value,
  onChange,
  options,
  className = '',
}: SegmentedControlProps) {
  return (
    <div className={`segmented-control ${className}`} role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`segmented-control-option ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
