import type { ReactNode } from 'react'
import './Card.css'

interface CardProps {
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
  compact?: boolean
  interactive?: boolean
  className?: string
  onClick?: () => void
  as?: 'div' | 'article' | 'section'
}

export function Card({
  children,
  header,
  footer,
  compact,
  interactive,
  className,
  onClick,
  as: Element = 'div',
}: CardProps) {
  const isInteractive = interactive ?? !!onClick

  const classes = [
    'ui-card',
    compact && 'ui-card--compact',
    isInteractive && 'ui-card--interactive',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Element className={classes} onClick={onClick}>
      {header && <div className="ui-card-header">{header}</div>}
      {children}
      {footer && <div className="ui-card-footer">{footer}</div>}
    </Element>
  )
}
