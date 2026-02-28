import type { ReactNode } from 'react'
import './EmptyState.css'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  hint?: string
  className?: string
}

export function EmptyState({ icon, title, description, action, hint, className }: EmptyStateProps) {
  return (
    <div className={`ui-empty-state${className ? ` ${className}` : ''}`}>
      {icon && <div className="ui-empty-state-icon">{icon}</div>}
      <h3 className="ui-empty-state-title">{title}</h3>
      {description && <p className="ui-empty-state-description">{description}</p>}
      {action && <div className="ui-empty-state-action">{action}</div>}
      {hint && <p className="ui-empty-state-hint">{hint}</p>}
    </div>
  )
}
