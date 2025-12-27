'use client'

export function ModulePlaceholder({
  title,
  description,
  primaryActionLabel,
}: {
  title: string
  description: string
  primaryActionLabel?: string
}) {
  return (
    <div className="module-placeholder">
      <p className="module-placeholder-label">Placeholder</p>
      <h2 className="module-placeholder-title">{title}</h2>
      <p className="module-placeholder-description">{description}</p>
      <button className="ghost-button" disabled>
        {primaryActionLabel ?? 'Coming soon'}
      </button>
    </div>
  )
}
