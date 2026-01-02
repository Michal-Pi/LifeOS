interface StatusDotProps {
  status?: 'online' | 'idle' | 'offline'
  label?: string
}

export function StatusDot({ status = 'idle', label }: StatusDotProps) {
  const statusClass = `status-dot status-dot--${status}`
  return <span className={statusClass} aria-label={label} role={label ? 'img' : undefined} />
}
