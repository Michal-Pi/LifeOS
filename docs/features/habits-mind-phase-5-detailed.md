# Phase 5: Polish & Advanced Features - Detailed Implementation Plan
**Version:** 1.0
**Created:** 2025-12-27
**Duration:** 7-10 days
**Prerequisites:** Phase 4 complete (Mind Engine functional)

## Overview

Phase 5 focuses on completing the Habits and Mind Engine implementation with advanced features, integrations, and production polish. This includes Weekly Review integration, habit analytics, calendar projection, performance optimization, and comprehensive testing.

### Key Deliverables
1. Weekly Review Habits & Mind section
2. Habit progress analytics and visualizations
3. Intelligent recommendations engine
4. Calendar projection for habits (optional time-blocking)
5. Performance optimization and lazy loading
6. Accessibility improvements
7. Mobile responsiveness
8. Comprehensive E2E tests
9. Production deployment preparation

---

## Table of Contents
1. [Weekly Review Integration](#weekly-review-integration)
2. [Habit Analytics & Visualizations](#habit-analytics--visualizations)
3. [Recommendations Engine](#recommendations-engine)
4. [Calendar Projection](#calendar-projection)
5. [Performance Optimization](#performance-optimization)
6. [Accessibility & Mobile](#accessibility--mobile)
7. [Testing & QA](#testing--qa)
8. [Documentation](#documentation)
9. [Deployment Checklist](#deployment-checklist)

---

## Weekly Review Integration

### 5.1 Weekly Review Architecture

Current Weekly Review structure (from [apps/web-vite/src/pages/WeeklyReviewPage.tsx](../../apps/web-vite/src/pages/WeeklyReviewPage.tsx)):
- Multi-step wizard pattern
- Existing steps: Past week reflection, Upcoming week planning, etc.

**Add new step:** Habits & Mind Review

### 5.2 Habits & Mind Review Step Component

#### `apps/web-vite/src/components/weeklyReview/HabitsAndMindStep.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useHabitOperations } from '@/hooks/useHabitOperations'
import { useHabitProgress } from '@/hooks/useHabitProgress'
import { useMindInterventions } from '@/hooks/useMindInterventions'
import { HabitConsistencyChart } from '@/components/habits/HabitConsistencyChart'
import { InterventionSummary } from '@/components/mind/InterventionSummary'
import { HabitRecommendations } from '@/components/habits/HabitRecommendations'
import { format, subDays } from 'date-fns'

interface HabitsAndMindStepProps {
  userId: string
  weekStartDate: Date
  weekEndDate: Date
  onNext: () => void
}

export function HabitsAndMindStep({
  userId,
  weekStartDate,
  weekEndDate,
  onNext
}: HabitsAndMindStepProps) {
  const { habits } = useHabitOperations()
  const { getWeeklyStats, calculateStreak } = useHabitProgress()
  const { recentSessions } = useMindInterventions()

  const [weeklyStats, setWeeklyStats] = useState<any[]>([])
  const [interventionCount, setInterventionCount] = useState(0)
  const [mostCommonFeeling, setMostCommonFeeling] = useState<string>('')

  useEffect(() => {
    loadWeeklyData()
  }, [weekStartDate, weekEndDate])

  const loadWeeklyData = async () => {
    const startKey = format(weekStartDate, 'yyyy-MM-dd')
    const endKey = format(weekEndDate, 'yyyy-MM-dd')

    // Get stats for each habit
    const stats = await Promise.all(
      habits
        .filter(h => h.status === 'active')
        .map(async habit => {
          const weekStats = await getWeeklyStats(habit.habitId, startKey, endKey)
          const streak = await calculateStreak(habit.habitId)
          return { habit, ...weekStats, currentStreak: streak }
        })
    )

    setWeeklyStats(stats)

    // Filter interventions for this week
    const weekSessions = recentSessions.filter(session => {
      const sessionDate = new Date(session.startedAtMs)
      return sessionDate >= weekStartDate && sessionDate <= weekEndDate
    })

    setInterventionCount(weekSessions.length)

    // Most common feeling
    const feelings = weekSessions
      .map(s => s.feelingBefore)
      .filter(Boolean)

    if (feelings.length > 0) {
      const feelingCounts = feelings.reduce((acc, f) => {
        acc[f!] = (acc[f!] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const mostCommon = Object.entries(feelingCounts)
        .sort(([, a], [, b]) => b - a)[0][0]

      setMostCommonFeeling(mostCommon)
    }
  }

  return (
    <div className="weekly-review-step habits-mind-step">
      <h2>📊 Habits & Mind Review</h2>
      <p className="step-subtitle">How did your habits and mindset go this week?</p>

      {/* Habit Consistency Overview */}
      <section className="review-section">
        <h3>Habit Consistency</h3>
        <HabitConsistencyChart stats={weeklyStats} />

        <div className="stats-summary">
          {weeklyStats.map(stat => (
            <div key={stat.habit.habitId} className="habit-stat-card">
              <div className="habit-stat-header">
                <h4>{stat.habit.title}</h4>
                <span className="streak-badge">
                  🔥 {stat.currentStreak} day streak
                </span>
              </div>

              <div className="habit-stat-metrics">
                <div className="metric">
                  <span className="metric-label">Consistency</span>
                  <span className="metric-value">{stat.consistencyPercent}%</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Done</span>
                  <span className="metric-value">{stat.doneCount}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Tiny</span>
                  <span className="metric-value">{stat.tinyCount}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Skipped</span>
                  <span className="metric-value">{stat.skipCount}</span>
                </div>
              </div>

              {/* Streak visualization */}
              {stat.currentStreak > 7 && (
                <p className="streak-message">
                  🎉 Amazing! You've kept this habit going for over a week!
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Mind Intervention Summary */}
      <section className="review-section">
        <h3>Mind & Stress Management</h3>

        <div className="intervention-stats">
          <div className="stat-card">
            <span className="stat-number">{interventionCount}</span>
            <span className="stat-label">Interventions used</span>
          </div>

          {mostCommonFeeling && (
            <div className="stat-card">
              <span className="stat-emoji">
                {mostCommonFeeling === 'anxious' && '😰'}
                {mostCommonFeeling === 'overwhelmed' && '🤯'}
                {mostCommonFeeling === 'angry' && '😤'}
                {mostCommonFeeling === 'tired' && '😮‍💨'}
              </span>
              <span className="stat-label">Most common feeling: {mostCommonFeeling}</span>
            </div>
          )}
        </div>

        <InterventionSummary sessions={recentSessions} weekStart={weekStartDate} weekEnd={weekEndDate} />
      </section>

      {/* Recommendations */}
      <section className="review-section">
        <h3>💡 Recommendations for Next Week</h3>
        <HabitRecommendations stats={weeklyStats} interventionCount={interventionCount} />
      </section>

      {/* Reflection Prompts */}
      <section className="review-section">
        <h3>Reflection</h3>

        <div className="reflection-prompt">
          <label>What habit pattern worked well this week?</label>
          <textarea
            placeholder="e.g., Doing my morning meditation right after waking up..."
            rows={3}
          />
        </div>

        <div className="reflection-prompt">
          <label>What got in the way of your habits?</label>
          <textarea
            placeholder="e.g., Late nights made morning habits harder..."
            rows={3}
          />
        </div>

        <div className="reflection-prompt">
          <label>What will you adjust for next week?</label>
          <textarea
            placeholder="e.g., Set earlier bedtime alarm to protect morning routine..."
            rows={3}
          />
        </div>
      </section>

      <div className="step-actions">
        <button className="btn-primary" onClick={onNext}>
          Continue to Next Week Planning →
        </button>
      </div>
    </div>
  )
}
```

---

## Habit Analytics & Visualizations

### 5.3 Habit Progress Hook

#### `apps/web-vite/src/hooks/useHabitProgress.ts`

```typescript
import { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreCheckinRepository } from '@/adapters/habits/firestoreCheckinRepository'
import type { HabitId, CanonicalHabitCheckin } from '@lifeos/habits'

const checkinRepo = createFirestoreCheckinRepository()

export interface HabitWeeklyStats {
  totalScheduledDays: number
  doneCount: number
  tinyCount: number
  skipCount: number
  missedCount: number
  consistencyPercent: number
}

export interface HabitProgressData {
  habitId: HabitId
  currentStreak: number
  longestStreak: number
  totalCheckins: number
  weeklyTrend: 'improving' | 'stable' | 'declining'
}

export function useHabitProgress() {
  const { user } = useAuth()
  const userId = user?.uid

  const getWeeklyStats = useCallback(async (
    habitId: HabitId,
    startDate: string,
    endDate: string
  ): Promise<HabitWeeklyStats> => {
    if (!userId) throw new Error('User not authenticated')

    const checkins = await checkinRepo.listForDateRange(userId, startDate, endDate)
    const habitCheckins = checkins.filter(c => c.habitId === habitId)

    // Calculate scheduled days in this range
    // For simplicity, assuming 7 days (would actually check habit.schedule.daysOfWeek)
    const totalScheduledDays = 7

    const doneCount = habitCheckins.filter(c => c.status === 'done').length
    const tinyCount = habitCheckins.filter(c => c.status === 'tiny').length
    const skipCount = habitCheckins.filter(c => c.status === 'skip').length
    const missedCount = totalScheduledDays - habitCheckins.length

    const consistencyPercent = Math.round(
      ((doneCount + tinyCount) / totalScheduledDays) * 100
    )

    return {
      totalScheduledDays,
      doneCount,
      tinyCount,
      skipCount,
      missedCount,
      consistencyPercent
    }
  }, [userId])

  const calculateStreak = useCallback(async (habitId: HabitId): Promise<number> => {
    if (!userId) throw new Error('User not authenticated')

    // Get recent check-ins (last 60 days)
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const startDate = sixtyDaysAgo.toISOString().split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]

    const checkins = await checkinRepo.listForDateRange(userId, startDate, endDate)
    const habitCheckins = checkins
      .filter(c => c.habitId === habitId)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey)) // Most recent first

    let streak = 0
    let currentDate = new Date()

    for (const checkin of habitCheckins) {
      const checkinDate = new Date(checkin.dateKey)
      const daysDiff = Math.floor((currentDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24))

      // If there's a gap of more than 2 days (allowing for recovery), break
      if (daysDiff > 2) break

      // Count done and tiny as streak-preserving
      if (checkin.status === 'done' || checkin.status === 'tiny') {
        streak++
        currentDate = checkinDate
      } else if (checkin.status === 'skip') {
        // Skip breaks the streak
        break
      }
    }

    return streak
  }, [userId])

  const getProgressTrend = useCallback(async (
    habitId: HabitId
  ): Promise<'improving' | 'stable' | 'declining'> => {
    if (!userId) return 'stable'

    // Compare last week vs week before
    const today = new Date()
    const lastWeekStart = new Date(today)
    lastWeekStart.setDate(today.getDate() - 7)
    const lastWeekEnd = today

    const priorWeekStart = new Date(today)
    priorWeekStart.setDate(today.getDate() - 14)
    const priorWeekEnd = new Date(today)
    priorWeekEnd.setDate(today.getDate() - 7)

    const lastWeekStats = await getWeeklyStats(
      habitId,
      lastWeekStart.toISOString().split('T')[0],
      lastWeekEnd.toISOString().split('T')[0]
    )

    const priorWeekStats = await getWeeklyStats(
      habitId,
      priorWeekStart.toISOString().split('T')[0],
      priorWeekEnd.toISOString().split('T')[0]
    )

    const diff = lastWeekStats.consistencyPercent - priorWeekStats.consistencyPercent

    if (diff > 10) return 'improving'
    if (diff < -10) return 'declining'
    return 'stable'
  }, [userId, getWeeklyStats])

  return {
    getWeeklyStats,
    calculateStreak,
    getProgressTrend
  }
}
```

### 5.4 Habit Consistency Chart Component

#### `apps/web-vite/src/components/habits/HabitConsistencyChart.tsx`

```typescript
interface HabitConsistencyChartProps {
  stats: Array<{
    habit: { habitId: string; title: string }
    doneCount: number
    tinyCount: number
    skipCount: number
    missedCount: number
    consistencyPercent: number
  }>
}

export function HabitConsistencyChart({ stats }: HabitConsistencyChartProps) {
  return (
    <div className="consistency-chart">
      {stats.map(stat => (
        <div key={stat.habit.habitId} className="consistency-bar-container">
          <div className="habit-label">{stat.habit.title}</div>

          <div className="consistency-bar">
            {stat.doneCount > 0 && (
              <div
                className="bar-segment done"
                style={{ width: `${(stat.doneCount / 7) * 100}%` }}
                title={`Done: ${stat.doneCount} days`}
              />
            )}
            {stat.tinyCount > 0 && (
              <div
                className="bar-segment tiny"
                style={{ width: `${(stat.tinyCount / 7) * 100}%` }}
                title={`Tiny: ${stat.tinyCount} days`}
              />
            )}
            {stat.skipCount > 0 && (
              <div
                className="bar-segment skip"
                style={{ width: `${(stat.skipCount / 7) * 100}%` }}
                title={`Skipped: ${stat.skipCount} days`}
              />
            )}
            {stat.missedCount > 0 && (
              <div
                className="bar-segment missed"
                style={{ width: `${(stat.missedCount / 7) * 100}%` }}
                title={`Missed: ${stat.missedCount} days`}
              />
            )}
          </div>

          <div className="consistency-percent">{stat.consistencyPercent}%</div>
        </div>
      ))}
    </div>
  )
}
```

**CSS for chart:**

```css
.consistency-chart {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.consistency-bar-container {
  display: grid;
  grid-template-columns: 200px 1fr 60px;
  gap: 1rem;
  align-items: center;
}

.consistency-bar {
  display: flex;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--muted);
}

.bar-segment {
  height: 100%;
  transition: width 0.3s ease;
}

.bar-segment.done {
  background: #22c55e; /* green */
}

.bar-segment.tiny {
  background: #3b82f6; /* blue */
}

.bar-segment.skip {
  background: #f59e0b; /* orange */
}

.bar-segment.missed {
  background: #e5e7eb; /* gray */
}

.consistency-percent {
  font-weight: 600;
  font-size: 1.125rem;
}
```

---

## Recommendations Engine

### 5.5 Habit Recommendations Component

#### `apps/web-vite/src/components/habits/HabitRecommendations.tsx`

```typescript
import { useMemo } from 'react'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import type { HabitWeeklyStats } from '@/hooks/useHabitProgress'

interface Recommendation {
  type: 'shrink' | 'anchor_change' | 'friction_removal' | 'calendar_block' | 'celebration'
  priority: 'high' | 'medium' | 'low'
  habitId: string
  habitTitle: string
  message: string
  actionLabel?: string
  action?: () => void
}

interface HabitRecommendationsProps {
  stats: Array<{
    habit: { habitId: string; title: string; anchor: any; recipe: any }
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
  const { createTask } = useTodoOperations({ userId: '' }) // Would get from context

  const recommendations = useMemo((): Recommendation[] => {
    const recs: Recommendation[] = []

    for (const stat of stats) {
      const { habit, consistencyPercent, skipCount, missedCount, currentStreak, doneCount, tinyCount } = stat

      // HIGH PRIORITY: Missed twice or more → Shrink habit
      if (missedCount >= 2 || skipCount >= 2) {
        recs.push({
          type: 'shrink',
          priority: 'high',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `${habit.title} was missed ${missedCount + skipCount} times. Consider making the tiny version even smaller to rebuild momentum.`,
          actionLabel: 'Make it easier',
          action: () => {
            // Would open edit modal for habit
          }
        })
      }

      // MEDIUM: Low consistency but some attempts → Anchor change
      if (consistencyPercent < 50 && (doneCount + tinyCount) > 0) {
        recs.push({
          type: 'anchor_change',
          priority: 'medium',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `${habit.title} has ${consistencyPercent}% consistency. Try anchoring it to a different time or event.`,
          actionLabel: 'Change anchor'
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
          action: async () => {
            await createTask({
              title: `Remove friction for: ${habit.title}`,
              priority: 'high',
              metadata: {
                source: 'habit_recommendation',
                sourceId: habit.habitId
              }
            })
          }
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
          actionLabel: 'Enable calendar projection'
        })
      }

      // CELEBRATION: High streak
      if (currentStreak >= 7) {
        recs.push({
          type: 'celebration',
          priority: 'low',
          habitId: habit.habitId,
          habitTitle: habit.title,
          message: `🎉 ${currentStreak}-day streak on ${habit.title}! You're building real momentum.`
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
        message: `💪 You used ${interventionCount} mind interventions this week. You're building resilience.`
      })
    } else if (interventionCount === 0) {
      recs.push({
        type: 'friction_removal',
        priority: 'low',
        habitId: 'mind',
        habitTitle: 'Mind interventions',
        message: `Consider using the "I'm activated" button when you feel stressed. Even 30 seconds helps.`
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
            <span className="rec-priority-badge">{rec.priority}</span>
            <h4>{rec.habitTitle}</h4>
          </div>

          <p className="rec-message">{rec.message}</p>

          {rec.actionLabel && rec.action && (
            <button className="rec-action-btn" onClick={rec.action}>
              {rec.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

---

## Calendar Projection

### 5.6 Calendar Integration for Habits

**Goal:** Create internal calendar events for habits (without syncing to Google).

#### Extend Calendar Event Model

Already defined in main plan - add `provider: 'lifeos'` to CanonicalCalendarEvent.

#### `apps/web-vite/src/hooks/useHabitCalendarProjection.ts`

```typescript
import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { newId } from '@lifeos/core'
import type { CanonicalHabit } from '@lifeos/habits'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'

const calendarRepo = createFirestoreCalendarEventRepository()

export function useHabitCalendarProjection() {
  const { user } = useAuth()
  const userId = user?.uid

  const enableProjection = useCallback(async (habit: CanonicalHabit) => {
    if (!userId) throw new Error('User not authenticated')
    if (!habit.calendarProjection?.enabled) return

    // Create recurring event for this habit
    const { blockMinutes, timeHint } = habit.calendarProjection

    // Determine start time based on anchor or timeHint
    let startHour = 9 // Default
    if (timeHint === 'morning') startHour = 7
    if (timeHint === 'midday') startHour = 12
    if (timeHint === 'evening') startHour = 18

    if (habit.anchor.type === 'time_window') {
      startHour = Math.floor(habit.anchor.startTimeMs / (1000 * 60 * 60))
    }

    // Create internal calendar event (one-time or recurring)
    const event: Omit<CanonicalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'> = {
      userId,
      calendarId: 'lifeos-habits', // Internal calendar
      provider: 'lifeos',
      title: `🎯 ${habit.title}`,
      description: `Habit: ${habit.recipe.standardVersion.description}\nTiny version: ${habit.recipe.tinyVersion.description}`,
      startTimeMs: Date.now(), // Would calculate actual time
      endTimeMs: Date.now() + (blockMinutes * 60 * 1000),
      allDay: false,
      metadata: {
        source: {
          type: 'habit_projection',
          habitId: habit.habitId
        }
      },
      // Recurrence would be added here based on habit.schedule.daysOfWeek
      recurrence: null, // Simplified for now
      syncState: 'synced',
      version: 1
    }

    // Would save to calendar repository
    // await calendarRepo.create(userId, event)

    return event
  }, [userId])

  const disableProjection = useCallback(async (habit: CanonicalHabit) => {
    if (!userId) throw new Error('User not authenticated')

    // Find and delete calendar events with this habitId in metadata
    // Would query: WHERE metadata.source.habitId == habit.habitId
    // Then delete those events
  }, [userId])

  return {
    enableProjection,
    disableProjection
  }
}
```

**Important:** Update calendar sync logic to filter out `provider: 'lifeos'` events from Google sync:

```typescript
// In firestoreCalendarEventRepository.ts or writeback logic
export const shouldSyncToGoogle = (event: CanonicalCalendarEvent): boolean => {
  // NEVER sync LifeOS-internal events to Google
  if (event.provider === 'lifeos') return false

  // Only sync Google-sourced events
  return event.provider === 'google'
}
```

---

## Performance Optimization

### 5.7 Lazy Loading and Code Splitting

#### Lazy load Today modules

```typescript
// apps/web-vite/src/pages/TodayPage.tsx
import { lazy, Suspense } from 'react'

const MorningModule = lazy(() => import('@/components/today/MorningModule'))
const WorkModule = lazy(() => import('@/components/today/WorkModule'))
const EveningModule = lazy(() => import('@/components/today/EveningModule'))

export function TodayPage() {
  // ...existing code...

  return (
    <div className="today-page">
      <Suspense fallback={<ModuleSkeleton />}>
        {(currentPeriod === 'morning' || expandedModule === 'morning') && (
          <MorningModule userId={user.uid} dateKey={dateKey} />
        )}
      </Suspense>

      <Suspense fallback={<ModuleSkeleton />}>
        {(currentPeriod === 'work' || expandedModule === 'work') && (
          <WorkModule userId={user.uid} />
        )}
      </Suspense>

      <Suspense fallback={<ModuleSkeleton />}>
        {(currentPeriod === 'evening' || expandedModule === 'evening') && (
          <EveningModule userId={user.uid} dateKey={dateKey} />
        )}
      </Suspense>
    </div>
  )
}
```

### 5.8 IndexedDB Query Optimization

Add indexes for common queries:

```typescript
// In offlineStore.ts - add compound indexes
export const getHabitsDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<HabitsDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Habits store
        if (!db.objectStoreNames.contains('habits')) {
          const habitStore = db.createObjectStore('habits', { keyPath: 'habitId' })
          habitStore.createIndex('userId', 'userId')
          habitStore.createIndex('status', 'status')
          habitStore.createIndex('syncState', 'syncState')

          // Compound index for faster queries
          habitStore.createIndex('userId_status', ['userId', 'status'])
        }

        // Check-ins store with better indexing
        if (!db.objectStoreNames.contains('habitCheckins')) {
          const checkinStore = db.createObjectStore('habitCheckins', { keyPath: 'checkinId' })
          checkinStore.createIndex('userId', 'userId')
          checkinStore.createIndex('dateKey', 'dateKey')
          checkinStore.createIndex('habitId', 'habitId')

          // Compound indexes for range queries
          checkinStore.createIndex('userId_dateKey', ['userId', 'dateKey'])
          checkinStore.createIndex('habitId_dateKey', ['habitId', 'dateKey'])
        }
      }
    })
  }
  return dbPromise
}
```

### 5.9 Memoization for Expensive Computations

```typescript
// In useHabitProgress.ts
import { useMemo } from 'react'

export function useHabitProgress() {
  // ... existing code ...

  // Memoize streak calculations
  const memoizedStreak = useMemo(() => {
    return calculateStreak
  }, [userId])

  return {
    getWeeklyStats,
    calculateStreak: memoizedStreak,
    getProgressTrend
  }
}
```

---

## Accessibility & Mobile

### 5.10 Accessibility Improvements

#### Add ARIA labels and keyboard navigation

```typescript
// In MindInterventionModal.tsx
export function MindInterventionModal({ isOpen, onClose, userId }: MindInterventionModalProps) {
  useEffect(() => {
    // Trap focus in modal
    if (isOpen) {
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      // Implement focus trap
    }
  }, [isOpen])

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close intervention modal"
        >
          ×
        </button>

        <h2 id="modal-title">Mind Reset</h2>
        {/* ... rest of modal ... */}
      </div>
    </div>
  )
}
```

#### Add reduced motion support

```css
@media (prefers-reduced-motion: reduce) {
  .modal-overlay,
  .consistency-bar,
  .timer-display {
    animation: none !important;
    transition: none !important;
  }
}
```

### 5.11 Mobile Responsiveness

```css
/* Mobile-first responsive design */

/* Today modules - stack on mobile */
@media (max-width: 768px) {
  .today-modules {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .module-card {
    width: 100%;
  }

  /* Habit check-in cards - vertical on mobile */
  .habit-checkin-card {
    flex-direction: column;
    align-items: stretch;
  }

  .checkin-buttons {
    flex-direction: row;
    justify-content: space-between;
  }

  /* Consistency chart - simplified on mobile */
  .consistency-bar-container {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .habit-label {
    font-size: 0.875rem;
  }
}

/* Touch-friendly buttons */
@media (hover: none) and (pointer: coarse) {
  button,
  .checkin-btn {
    min-height: 44px; /* iOS minimum tap target */
    min-width: 44px;
    padding: 0.75rem 1rem;
  }
}
```

---

## Testing & QA

### 5.12 E2E Test Suite

#### `apps/web-vite/src/__tests__/e2e/habits-flow.test.tsx`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodayPage } from '@/pages/TodayPage'
import { TestWrapper } from '@/test-utils/TestWrapper'

describe('Habits E2E Flow', () => {
  beforeEach(() => {
    // Reset test database
  })

  it('should complete full habit check-in flow', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <TodayPage />
      </TestWrapper>
    )

    // Wait for Evening Module to load
    await waitFor(() => {
      expect(screen.getByText(/Evening Closeout/i)).toBeInTheDocument()
    })

    // Click to expand evening module
    await user.click(screen.getByText(/Evening Closeout/i))

    // Find habit check-in card
    const meditationHabit = screen.getByText(/Morning Meditation/i)
    expect(meditationHabit).toBeInTheDocument()

    // Check in as "done"
    const doneButton = screen.getByRole('button', { name: /Done/i })
    await user.click(doneButton)

    // Verify check-in saved
    await waitFor(() => {
      expect(screen.getByText(/Logged as: done/i)).toBeInTheDocument()
    })
  })

  it('should handle offline check-in and sync when online', async () => {
    // TODO: Implement offline test
  })
})
```

### 5.13 Visual Regression Testing

Use Playwright or similar for screenshot comparison:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } }
  ]
})
```

---

## Documentation

### 5.14 User Documentation

Create guide: `docs/features/HABITS_USER_GUIDE.md`

```markdown
# Habits & Mind Engine User Guide

## Getting Started with Habits

### Creating Your First Habit

1. Navigate to **Habits** page
2. Click **+ New Habit**
3. Fill in:
   - **Title**: e.g., "Morning Meditation"
   - **Tiny Version**: e.g., "Take 3 deep breaths"
   - **Standard Version**: e.g., "10-minute guided meditation"
   - **Anchor**: When does this happen? (e.g., "After I wake up")
   - **Schedule**: Which days? (e.g., Mon-Fri)

### Checking In

In the **Evening Module** of Today page:
- ✓ **Done** = Completed the full version
- ~ **Tiny** = Did the minimal version (still counts!)
- – **Skip** = Chose not to do it today

### Understanding Streaks

- Your streak increases when you mark a habit as Done or Tiny
- Skipping breaks your streak
- Missing a day (not logging) doesn't break it immediately - you have a 2-day grace period

## Using Mind Interventions

### When to Use "I'm Activated"

Tap the **I'm Activated** button when you feel:
- Anxious before a meeting
- Overwhelmed by your task list
- Frustrated or angry
- Procrastinating on something important

### Intervention Types

**Breathing (30-60 seconds)**
- Physiological Sigh: Fastest stress reduction
- Box Breathing: Focus and calm

**Cognitive (1-2 minutes)**
- CBT Thought Record: Challenge anxious thoughts
- Best/Worst/Likely: Reality-test worries

**Mindfulness (1 minute)**
- ACT Defusion: Create distance from thoughts
- What's True Right Now: Ground in present reality

### Auto-Linking to Habits

When you complete a breathing or mindfulness intervention, it can automatically mark your meditation habit as done for the day.

## Weekly Review

The **Habits & Mind** section shows:
- Consistency chart for all habits
- Current streaks
- Number of interventions used
- Personalized recommendations

### Recommendations Explained

- **Shrink**: Habit missed 2+ times → Make tiny version even smaller
- **Change Anchor**: Low consistency → Try different time/trigger
- **Remove Friction**: Prepare environment to make habit easier
- **Calendar Block**: Add time protection for consistent habits

## Tips for Success

1. **Start Tiny**: Your tiny version should be so small it's embarrassingly easy
2. **Anchor Wisely**: Link to existing routines (after coffee, before bed)
3. **Celebrate Small Wins**: Tiny version counts as success
4. **Use Interventions Proactively**: Don't wait until you're overwhelmed
5. **Review Weekly**: Adjust based on what's working

## Troubleshooting

**Habit not showing in Evening Module?**
- Check that it's scheduled for today's day of week
- Ensure status is "Active" not "Paused"

**Can't complete intervention?**
- You can close and return to it later
- Steps auto-advance after timers complete
- Skip to next step if needed

**Streak seems wrong?**
- Retroactively log missed days if within grace period
- Check timezone settings

---

For technical issues, see [GitHub Issues](https://github.com/...)
```

---

## Deployment Checklist

### 5.15 Pre-Deployment Verification

```bash
# 1. Build all packages
pnpm turbo build

# 2. Run all tests
pnpm turbo test

# 3. Type check
pnpm turbo typecheck

# 4. Lint
pnpm turbo lint

# 5. Bundle size check
pnpm --filter web-vite build
# Check dist/ size - should be < 2MB total

# 6. Lighthouse audit
pnpm --filter web-vite preview
# Run Lighthouse in Chrome DevTools
# Target: Performance > 90, Accessibility > 95

# 7. Test offline mode
# Disconnect network, verify:
# - Habit check-ins save to IndexedDB
# - Mind interventions work offline
# - Sync queue processes when back online
```

### 5.16 Production Deploy

```bash
# 1. Seed system interventions (one-time)
firebase functions:call seedSystemInterventions

# 2. Deploy Firestore indexes
firebase deploy --only firestore:indexes

# 3. Deploy security rules
firebase deploy --only firestore:rules

# 4. Deploy functions (if any new ones)
firebase deploy --only functions

# 5. Deploy hosting
firebase deploy --only hosting

# 6. Verify deployment
# - Check that Today page loads
# - Create test habit
# - Run test intervention
# - Verify offline mode
```

### 5.17 Monitoring & Rollback

```javascript
// Add error tracking
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay()
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
})
```

**Rollback plan:**
```bash
# If issues detected:
firebase hosting:rollback

# Or deploy previous version:
git checkout <previous-commit>
pnpm turbo build
firebase deploy --only hosting
```

---

## Acceptance Criteria

### Phase 5 Complete When:

- ✅ Weekly Review shows Habits & Mind section
- ✅ Habit consistency charts render correctly
- ✅ Recommendations engine provides actionable insights
- ✅ Calendar projection creates internal events (no Google sync)
- ✅ All pages load in < 3s on 3G
- ✅ Lighthouse scores: Performance > 90, Accessibility > 95
- ✅ Mobile responsive (tested on iOS and Android)
- ✅ Keyboard navigation works throughout
- ✅ Offline mode fully functional
- ✅ E2E tests pass
- ✅ User documentation complete
- ✅ Production deployment successful
- ✅ No critical bugs in first 48 hours

---

## Post-Launch Monitoring

### Week 1 Metrics to Track:

1. **Usage**
   - Number of habits created
   - Daily check-in rate
   - Intervention usage frequency

2. **Performance**
   - Page load times (p50, p95)
   - IndexedDB query performance
   - Error rate

3. **Engagement**
   - Weekly Review completion rate
   - Recommendation click-through rate
   - Average streak length

4. **Technical**
   - Offline sync success rate
   - Cache hit rate
   - Bundle size

---

**END OF PHASE 5 PLAN**
