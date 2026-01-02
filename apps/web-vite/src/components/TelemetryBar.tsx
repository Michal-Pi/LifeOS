interface TelemetryItem {
  label: string
  value: string
}

interface TelemetryBarProps {
  items: TelemetryItem[]
}

export function TelemetryBar({ items }: TelemetryBarProps) {
  return (
    <div className="telemetry-strip" role="list">
      {items.map((item, index) => (
        <span key={item.label} role="listitem">
          {item.label}: {item.value}
          {index < items.length - 1 && <span className="telemetry-divider"> | </span>}
        </span>
      ))}
    </div>
  )
}
