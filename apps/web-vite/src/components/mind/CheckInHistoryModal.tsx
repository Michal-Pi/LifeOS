/**
 * CheckInHistoryModal Component
 *
 * Displays a history visualization of check-ins with:
 * - Top: Emotion graph (positive to negative, top to bottom)
 * - Bottom: Energy level graph
 */

import { useEffect, useRef, useMemo } from 'react'
import type { DailyCheckIn, CoreEmotionId } from '@lifeos/mind'
import { getCoreEmotionById, getEmotionLabel } from '@lifeos/mind'
import '@/styles/components/CheckInHistoryModal.css'

interface CheckInHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  checkIns: DailyCheckIn[]
}

// Order core emotions from most positive (top) to most negative (bottom)
const EMOTION_ORDER: CoreEmotionId[] = [
  'happy',
  'surprised',
  'neutral',
  'bad',
  'disgusted',
  'fearful',
  'sad',
  'angry',
]

// Map emotion to Y position (0 = top/positive, 6 = bottom/negative)
function getEmotionYPosition(coreEmotionId: CoreEmotionId): number {
  const index = EMOTION_ORDER.indexOf(coreEmotionId)
  return index === -1 ? 3 : index // Default to middle if not found
}

// Map energy level to Y position (inverted: high = top)
function getEnergyYPosition(energyLevel: string): number {
  switch (energyLevel) {
    case 'high':
      return 0
    case 'medium':
      return 1
    case 'low':
      return 2
    default:
      return 1
  }
}

// Format date for display
function formatDate(dateKey: string): string {
  const date = new Date(dateKey)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Get time of day label
function getTimeLabel(timeOfDay: string): string {
  switch (timeOfDay) {
    case 'morning':
      return 'AM'
    case 'afternoon':
      return 'PM'
    case 'evening':
      return 'EVE'
    default:
      return ''
  }
}

export function CheckInHistoryModal({ isOpen, onClose, checkIns }: CheckInHistoryModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Sort check-ins by date and time
  const sortedCheckIns = useMemo(() => {
    return [...checkIns].sort((a, b) => {
      if (a.dateKey !== b.dateKey) {
        return a.dateKey.localeCompare(b.dateKey)
      }
      const timeOrder = { morning: 0, afternoon: 1, evening: 2 }
      return (timeOrder[a.timeOfDay] || 0) - (timeOrder[b.timeOfDay] || 0)
    })
  }, [checkIns])

  // Group check-ins by date for X-axis labels
  const dateGroups = useMemo(() => {
    const groups: { dateKey: string; checkIns: DailyCheckIn[] }[] = []
    let currentDate = ''
    let currentGroup: DailyCheckIn[] = []

    sortedCheckIns.forEach((checkIn) => {
      if (checkIn.dateKey !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ dateKey: currentDate, checkIns: currentGroup })
        }
        currentDate = checkIn.dateKey
        currentGroup = [checkIn]
      } else {
        currentGroup.push(checkIn)
      }
    })

    if (currentGroup.length > 0) {
      groups.push({ dateKey: currentDate, checkIns: currentGroup })
    }

    return groups
  }, [sortedCheckIns])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  const hasData = sortedCheckIns.length > 0

  return (
    <div className="checkin-history-modal-backdrop" onClick={handleBackdropClick}>
      <div className="checkin-history-modal" ref={modalRef} role="dialog" aria-modal="true">
        <div className="checkin-history-modal-header">
          <h2 className="checkin-history-modal-title">Check-In History</h2>
          <button className="checkin-history-modal-close" onClick={onClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="checkin-history-modal-content">
          {!hasData ? (
            <div className="checkin-history-empty">
              <p>No check-in history yet.</p>
              <p className="checkin-history-empty-hint">
                Start tracking your emotions and energy to see trends over time.
              </p>
            </div>
          ) : (
            <>
              {/* Emotion Graph */}
              <div className="checkin-history-section">
                <h3 className="checkin-history-section-title">Emotional State</h3>
                <div className="checkin-history-graph-container">
                  <EmotionGraph checkIns={sortedCheckIns} dateGroups={dateGroups} />
                </div>
              </div>

              {/* Energy Graph */}
              <div className="checkin-history-section">
                <h3 className="checkin-history-section-title">Energy Level</h3>
                <div className="checkin-history-graph-container">
                  <EnergyGraph checkIns={sortedCheckIns} dateGroups={dateGroups} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ----- Emotion Graph Component -----

interface GraphProps {
  checkIns: DailyCheckIn[]
  dateGroups: { dateKey: string; checkIns: DailyCheckIn[] }[]
}

function EmotionGraph({ checkIns, dateGroups }: GraphProps) {
  const graphHeight = 200
  const graphWidth = Math.max(600, checkIns.length * 80)
  const padding = { top: 20, right: 40, bottom: 50, left: 80 }
  const plotHeight = graphHeight - padding.top - padding.bottom
  const plotWidth = graphWidth - padding.left - padding.right

  // Y-axis labels (emotions)
  const yLabels = EMOTION_ORDER.map((id) => getCoreEmotionById(id)?.label || id)

  // Calculate positions
  const points = checkIns.map((checkIn, index) => {
    const x = padding.left + (index / Math.max(checkIns.length - 1, 1)) * plotWidth
    const yPos = getEmotionYPosition(checkIn.coreEmotionId)
    const y = padding.top + (yPos / (EMOTION_ORDER.length - 1)) * plotHeight
    const core = getCoreEmotionById(checkIn.coreEmotionId)
    return {
      x,
      y,
      checkIn,
      color: core?.color || 'var(--text-secondary)',
      label: getEmotionLabel(checkIn.emotionId),
    }
  })

  return (
    <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} className="checkin-history-graph">
      {/* Y-axis labels */}
      {yLabels.map((label, index) => {
        const y = padding.top + (index / (yLabels.length - 1)) * plotHeight
        const core = getCoreEmotionById(EMOTION_ORDER[index])
        return (
          <g key={label}>
            <line
              x1={padding.left}
              y1={y}
              x2={graphWidth - padding.right}
              y2={y}
              className="graph-gridline"
            />
            <text x={padding.left - 8} y={y} className="graph-y-label" textAnchor="end">
              {label}
            </text>
            <circle cx={padding.left - 50} cy={y} r={4} fill={core?.color || 'var(--border)'} />
          </g>
        )
      })}

      {/* Connecting lines */}
      {points.length > 1 && (
        <path
          d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
          className="graph-line"
          fill="none"
        />
      )}

      {/* Data points with labels */}
      {points.map((point, index) => (
        <g key={index} className="graph-point-group">
          <circle cx={point.x} cy={point.y} r={8} fill={point.color} className="graph-point" />
          <text x={point.x} y={point.y - 14} className="graph-point-label" textAnchor="middle">
            {point.label}
          </text>
          <text x={point.x} y={graphHeight - 10} className="graph-x-label" textAnchor="middle">
            {getTimeLabel(point.checkIn.timeOfDay)}
          </text>
        </g>
      ))}

      {/* Date labels */}
      {dateGroups.map((group) => {
        // Find the middle x position for this date group
        const startIdx = checkIns.findIndex((c) => c.dateKey === group.dateKey)
        const endIdx = startIdx + group.checkIns.length - 1
        const startX = points[startIdx]?.x || 0
        const endX = points[endIdx]?.x || startX
        const midX = (startX + endX) / 2

        return (
          <text
            key={group.dateKey}
            x={midX}
            y={graphHeight - 28}
            className="graph-date-label"
            textAnchor="middle"
          >
            {formatDate(group.dateKey)}
          </text>
        )
      })}
    </svg>
  )
}

// ----- Energy Graph Component -----

function EnergyGraph({ checkIns, dateGroups }: GraphProps) {
  const graphHeight = 140
  const graphWidth = Math.max(600, checkIns.length * 80)
  const padding = { top: 20, right: 40, bottom: 50, left: 80 }
  const plotHeight = graphHeight - padding.top - padding.bottom
  const plotWidth = graphWidth - padding.left - padding.right

  const yLabels = ['High', 'Medium', 'Low']
  const energyColors = {
    high: 'var(--success)',
    medium: 'var(--warning)',
    low: 'var(--error)',
  }

  // Calculate positions
  const points = checkIns.map((checkIn, index) => {
    const x = padding.left + (index / Math.max(checkIns.length - 1, 1)) * plotWidth
    const yPos = getEnergyYPosition(checkIn.energyLevel)
    const y = padding.top + (yPos / 2) * plotHeight
    return {
      x,
      y,
      checkIn,
      color: energyColors[checkIn.energyLevel as keyof typeof energyColors] || 'var(--accent)',
    }
  })

  return (
    <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} className="checkin-history-graph">
      {/* Y-axis labels */}
      {yLabels.map((label, index) => {
        const y = padding.top + (index / 2) * plotHeight
        return (
          <g key={label}>
            <line
              x1={padding.left}
              y1={y}
              x2={graphWidth - padding.right}
              y2={y}
              className="graph-gridline"
            />
            <text x={padding.left - 8} y={y} className="graph-y-label" textAnchor="end">
              {label}
            </text>
          </g>
        )
      })}

      {/* Connecting lines */}
      {points.length > 1 && (
        <path
          d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
          className="graph-line"
          fill="none"
        />
      )}

      {/* Data points */}
      {points.map((point, index) => (
        <g key={index} className="graph-point-group">
          <circle cx={point.x} cy={point.y} r={8} fill={point.color} className="graph-point" />
          <text x={point.x} y={graphHeight - 10} className="graph-x-label" textAnchor="middle">
            {getTimeLabel(point.checkIn.timeOfDay)}
          </text>
        </g>
      ))}

      {/* Date labels */}
      {dateGroups.map((group) => {
        const startIdx = checkIns.findIndex((c) => c.dateKey === group.dateKey)
        const endIdx = startIdx + group.checkIns.length - 1
        const startX = points[startIdx]?.x || 0
        const endX = points[endIdx]?.x || startX
        const midX = (startX + endX) / 2

        return (
          <text
            key={group.dateKey}
            x={midX}
            y={graphHeight - 28}
            className="graph-date-label"
            textAnchor="middle"
          >
            {formatDate(group.dateKey)}
          </text>
        )
      })}
    </svg>
  )
}
