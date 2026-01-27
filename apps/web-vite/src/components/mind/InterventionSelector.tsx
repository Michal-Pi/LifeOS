/**
 * Intervention Selector Component
 *
 * Displays recommended interventions based on the selected feeling.
 * Allows users to choose an intervention to run.
 */

import { useState, useEffect } from 'react'
import type { CanonicalInterventionPreset, FeelingState } from '@lifeos/mind'
import { useMindInterventions } from '@/hooks/useMindInterventions'
import { Button } from '@/components/ui/button'

interface InterventionSelectorProps {
  feeling: FeelingState
  onSelect: (intervention: CanonicalInterventionPreset) => void
  onBack: () => void
}

export function InterventionSelector({ feeling, onSelect, onBack }: InterventionSelectorProps) {
  const { listInterventionsByFeeling, listSystemInterventions, isLoading } = useMindInterventions()
  const [interventions, setInterventions] = useState<CanonicalInterventionPreset[]>([])

  useEffect(() => {
    const loadInterventions = async () => {
      try {
        // First try to get interventions for this specific feeling
        const feelingInterventions = await listInterventionsByFeeling(feeling)

        if (feelingInterventions.length > 0) {
          setInterventions(feelingInterventions)
        } else {
          // Fall back to all system interventions if none match the feeling
          const systemInterventions = await listSystemInterventions()
          setInterventions(systemInterventions)
        }
      } catch (error) {
        console.error('Failed to load interventions:', error)
        // Fall back to loading all system interventions on error
        try {
          const systemInterventions = await listSystemInterventions()
          setInterventions(systemInterventions)
        } catch (fallbackError) {
          console.error('Failed to load system interventions:', fallbackError)
        }
      }
    }

    void loadInterventions()
  }, [feeling, listInterventionsByFeeling, listSystemInterventions])

  if (isLoading && interventions.length === 0) {
    return (
      <div className="intervention-selector">
        <Button variant="ghost" type="button" onClick={onBack} className="back-button">
          ← Back
        </Button>
        <div className="loading-state">
          <p>Loading interventions...</p>
        </div>
      </div>
    )
  }

  const getFeelingLabel = (feeling: FeelingState): string => {
    const labels: Record<FeelingState, string> = {
      anxious: 'anxious',
      overwhelmed: 'overwhelmed',
      angry: 'angry',
      avoidant: 'avoidant',
      restless: 'restless',
      tired: 'tired',
      neutral: 'checking in',
    }
    return labels[feeling] || feeling
  }

  return (
    <div className="intervention-selector">
      <Button variant="ghost" type="button" onClick={onBack} className="back-button">
        ← Back
      </Button>

      <h3 className="intervention-selector-title">
        Recommended for feeling {getFeelingLabel(feeling)}
      </h3>
      <p className="intervention-selector-subtitle">Choose an intervention to practice</p>

      {interventions.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">No interventions available</p>
          <p className="empty-state-hint">Check back later for system presets</p>
        </div>
      ) : (
        <div className="intervention-list">
          {interventions.map((intervention) => (
            <Button
              variant="ghost"
              key={intervention.interventionId}
              type="button"
              onClick={() => onSelect(intervention)}
              className="intervention-card"
            >
              <div className="intervention-header">
                <h4 className="intervention-title">{intervention.title}</h4>
                <span className="intervention-duration">
                  {Math.ceil(intervention.defaultDurationSec / 60)} min
                </span>
              </div>
              <p className="intervention-description">{intervention.description}</p>
              <div className="intervention-tags">
                {intervention.tags.map((tag) => (
                  <span key={tag} className="intervention-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
