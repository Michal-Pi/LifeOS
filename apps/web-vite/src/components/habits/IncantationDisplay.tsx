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
}

export function IncantationDisplay({ keystoneDomain }: IncantationDisplayProps) {
  const { loadIncantations, getActiveIncantations } = useIncantations()

  useEffect(() => {
    loadIncantations({ activeOnly: true })
  }, [loadIncantations])

  const displayIncantations = getActiveIncantations(keystoneDomain)

  if (displayIncantations.length === 0) {
    return null
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
