import type { ReactNode } from 'react'
import './Badge.css'

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'outline'
  | 'work'
  | 'projects'
  | 'life'
  | 'learning'
  | 'wellbeing'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
  size?: 'sm' | 'md'
}

export function Badge({ variant = 'default', children, className, size = 'md' }: BadgeProps) {
  const classes = ['ui-badge', `ui-badge--${variant}`, size === 'sm' && 'ui-badge--sm', className]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{children}</span>
}
