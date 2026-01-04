import type { ReactNode } from 'react'

interface EmptyStateProps {
  label?: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  hint?: string
  children?: ReactNode
}

export function EmptyState({
  label,
  title,
  description,
  actionLabel,
  onAction,
  hint,
  children,
}: EmptyStateProps) {
  return (
    <div className="empty-state-card">
      {label && <p className="section-label">{label}</p>}
      <h3>{title}</h3>
      <p className="empty-state-description">{description}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
      {children && <div className="empty-state-preview">{children}</div>}
      {actionLabel && onAction && (
        <button type="button" className="primary-button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
