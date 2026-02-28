import type { ReactNode } from 'react'
import './PageHeader.css'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  breadcrumb?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={`ui-page-header${className ? ` ${className}` : ''}`}>
      <div className="ui-page-header-content">
        {breadcrumb && <div className="ui-page-header-breadcrumb">{breadcrumb}</div>}
        <h1 className="ui-page-header-title">{title}</h1>
        {subtitle && <p className="ui-page-header-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </div>
  )
}
