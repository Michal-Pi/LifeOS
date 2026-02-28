/**
 * Habit Recommendations Component
 *
 * Provides actionable insights based on habit performance:
 * - Suggests shrinking habits with low consistency
 * - Recommends anchor changes for struggling habits
 * - Identifies friction removal opportunities
 * - Celebrates streaks and successes
 */

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'

interface Recommendation {
  type: 'shrink' | 'anchor_change' | 'friction_removal' | 'calendar_block' | 'celebration'
  priority: 'high' | 'medium' | 'low'
  habitId: string
  habitTitle: string
  message: string
  actionLabel?: string
}

interface HabitRecommendationsProps {
  stats: Array<{
    habit: { habitId: string; title: string }
    doneCount: number
    tinyCount: number
    skipCount: number
    missedCount: number
    consistencyPercent: number
    currentStreak: number
  }>
  interventionCount: number
}

export function HabitRecommendations({ stats, interventionCount }: HabitRecommendationsProps) {
  const recommendations = useMemo((): Recommendation[] => {
    const recs: Recommendation[] = []

    for (const stat of stats) {
      const {
        habit,
        consistencyPercent,
        skipCount,
        missedCount,
        currentStreak,
        doneCount,
        tinyCount,
      } = stat

      // HIGH PRIORITY: Missed twice or more → Shrink habit
      if (missedCount >= 2 || skipCount >= 2) {
        recs.push({
          type: 'shrink',
          priority: 'high',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `${habit.title} was missed ${missedCount + skipCount} times. Consider making the tiny version even smaller to rebuild momentum.`,
          actionLabel: 'Make it easier',
        })
      }

      // MEDIUM: Low consistency but some attempts → Anchor change
      if (consistencyPercent < 50 && doneCount + tinyCount > 0) {
        recs.push({
          type: 'anchor_change',
          priority: 'medium',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `${habit.title} has ${consistencyPercent}% consistency. Try anchoring it to a different time or event.`,
          actionLabel: 'Change anchor',
        })
      }

      // MEDIUM: Friction removal needed
      if (skipCount >= 1 && tinyCount > doneCount) {
        recs.push({
          type: 'friction_removal',
          priority: 'medium',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `You're doing the tiny version of ${habit.title} more than the full version. What friction can you remove?`,
          actionLabel: 'Create friction-removal task',
        })
      }

      // LOW: Add calendar block for consistency
      if (consistencyPercent >= 60 && consistencyPercent < 80) {
        recs.push({
          type: 'calendar_block',
          priority: 'low',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `${habit.title} is doing well (${consistencyPercent}%). Add a calendar block to protect this time.`,
          actionLabel: 'Enable calendar projection',
        })
      }

      // CELEBRATION: High streak
      if (currentStreak >= 7) {
        recs.push({
          type: 'celebration',
          priority: 'low',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `🎉 ${currentStreak}-day streak on ${habit.title}! You're building real momentum.`,
        })
      }
    }

    // Mind intervention recommendation
    if (interventionCount >= 5) {
      recs.push({
        type: 'celebration',
        priority: 'low',
        habitId: 'mind',
        habitTitle: 'Mind interventions',
        message: `💪 You used ${interventionCount} mind interventions this week. You're building resilience.`,
      })
    } else if (interventionCount === 0) {
      recs.push({
        type: 'friction_removal',
        priority: 'low',
        habitId: 'mind',
        habitTitle: 'Mind interventions',
        message: `Consider using the "I'm activated" button when you feel stressed. Even 30 seconds helps.`,
      })
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
  }, [stats, interventionCount])

  if (recommendations.length === 0) {
    return (
      <div className="no-recommendations">
        <p>✨ Everything looks great! Keep up the consistency.</p>
      </div>
    )
  }

  return (
    <div className="habit-recommendations">
      {recommendations.map((rec, idx) => (
        <div key={idx} className={`recommendation-card priority-${rec.priority}`}>
          <div className="rec-header">
            <span className={`rec-priority-badge ${rec.priority}`}>{rec.priority}</span>
            <h4>{rec.habitTitle}</h4>
          </div>

          <p className="rec-message">{rec.message}</p>

          {rec.actionLabel && (
            <Button
              variant="ghost"
              type="button"
              className="rec-action-btn"
              onClick={() => {
                // Would trigger appropriate action (edit habit, create todo, etc.)
                logger.debug(`Action: ${rec.actionLabel} for ${rec.habitTitle}`)
              }}
            >
              {rec.actionLabel}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
