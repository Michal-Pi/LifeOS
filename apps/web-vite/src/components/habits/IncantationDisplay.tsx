/**
 * Incantation Display Component
 *
 * Shows daily incantations (identity statements, values, self-compassion)
 * in the Today page to support habit formation and mindset
 */

import { useEffect } from 'react'
import { useIncantations } from '@/hooks/useIncantations'
import type { HabitDomain } from '@lifeos/habits'

interface IncantationDisplayProps {
  keystoneDomain?: HabitDomain
  variant?: 'card' | 'embedded'
}

export function IncantationDisplay({ keystoneDomain, variant = 'card' }: IncantationDisplayProps) {
  const { loadIncantations, getActiveIncantations } = useIncantations()

  useEffect(() => {
    loadIncantations({ activeOnly: true })
  }, [loadIncantations])

  const displayIncantations = getActiveIncantations(keystoneDomain)

  if (displayIncantations.length === 0) {
    return null
  }

  if (variant === 'embedded') {
    return (
      <section className="today-subsection incantation-embedded">
        <div className="today-subsection-header">
          <p className="section-label">Incantations</p>
        </div>
        <div className="incantation-list incantation-list--embedded">
          {displayIncantations.map((incantation) => (
            <div key={incantation.incantationId} className="incantation-item">
              <div className="incantation-type-badge">{incantation.type.replace('_', ' ')}</div>
              <p className="incantation-text">{incantation.text}</p>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="incantation-card">
      <p className="section-label">Daily Incantations</p>
      <div className="incantation-list">
        {displayIncantations.map((incantation) => (
          <div key={incantation.incantationId} className="incantation-item">
            <div className="incantation-type-badge">{incantation.type.replace('_', ' ')}</div>
            <p className="incantation-text">{incantation.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
