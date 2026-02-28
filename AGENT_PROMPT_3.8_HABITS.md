# Agent Prompt — Task 3.8: Habits & Personal Development — Streaks & Weekly Review

> **Scope:** Add visual streak tracking with a GitHub-style heatmap, weekly habit insights, and a guided 5-step weekly review wizard that produces a dated note.
>
> **Deferred:** Habit + Calendar Integration (3.8.2) — ghost calendar events and bidirectional completion sync are complex for marginal value. Users can schedule habits via manual calendar events.

---

## 0. Context & References

| Item               | Path (relative to repo root)                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Design tokens**  | `apps/web-vite/src/tokens.css`                                                                                                   |
| **UI primitives**  | `apps/web-vite/src/components/ui/`                                                                                               |
| **TodayPage**      | `apps/web-vite/src/pages/TodayPage.tsx` — `HabitCheckInCard` section                                                             |
| **PlannerPage**    | `apps/web-vite/src/pages/PlannerPage.tsx` — habits tab removed in Task 2.5                                                       |
| **Habit model**    | `packages/habits/src/domain/models.ts` — `CanonicalHabit`, `CanonicalHabitCheckin`, `CheckinStatus`, `HabitProgressStats`        |
| **Habit usecases** | `packages/habits/src/usecases/habitUsecases.ts` — `calculateStreakUsecase`, `calculateBestStreakUsecase`, `getHabitStatsUsecase` |
| **Habit hooks**    | `apps/web-vite/src/hooks/useHabitOperations.ts`                                                                                  |
| **Note model**     | `packages/notes/src/domain/models.ts`                                                                                            |
| **Note hooks**     | `apps/web-vite/src/hooks/useNoteOperations.ts`                                                                                   |
| **Task hooks**     | `apps/web-vite/src/hooks/useTodoOperations.ts`                                                                                   |
| **Calendar hooks** | `apps/web-vite/src/hooks/useCalendarEvents.ts`                                                                                   |
| **CSS**            | Habit styles in globals.css or dedicated habit CSS                                                                               |

**Current state:** Habits have `CanonicalHabitCheckin` with `status` (done/tiny/skip), `dateKey` (YYYY-MM-DD). The usecases already compute `currentStreak`, `bestStreak`, `totalCheckins`, `completionRate` in `HabitProgressStats`. However, there's no visual streak UI, no heatmap, no insights, and no weekly review flow.

---

## Phase A — Streak Display & Heatmap

### A1. Create `HabitStreakCard` Component

Create `apps/web-vite/src/components/habits/HabitStreakCard.tsx`:

```tsx
interface HabitStreakCardProps {
  habit: CanonicalHabit
  checkins: CanonicalHabitCheckin[]
  stats: HabitProgressStats
}

export function HabitStreakCard({ habit, checkins, stats }: HabitStreakCardProps) {
  return (
    <div className="habit-streak-card">
      <div className="habit-streak-card__header">
        <h3>{habit.title}</h3>
        <span className={`habit-streak-card__domain habit-streak-card__domain--${habit.domain}`}>
          {habit.domain}
        </span>
      </div>

      {/* Streak numbers */}
      <div className="habit-streak-card__stats">
        <div className="streak-stat">
          <span className="streak-stat__value">{stats.currentStreak}</span>
          <span className="streak-stat__label">Current</span>
        </div>
        <div className="streak-stat">
          <span className="streak-stat__value">{stats.bestStreak}</span>
          <span className="streak-stat__label">Best</span>
        </div>
        <div className="streak-stat">
          <span className="streak-stat__value">{Math.round(stats.completionRate * 100)}%</span>
          <span className="streak-stat__label">Rate</span>
        </div>
      </div>

      {/* Heatmap */}
      <HabitHeatmap checkins={checkins} days={90} />
    </div>
  )
}
```

### A2. Create `HabitHeatmap` Component

Create `apps/web-vite/src/components/habits/HabitHeatmap.tsx`:

```tsx
interface HabitHeatmapProps {
  checkins: CanonicalHabitCheckin[]
  days: number // How many days to show (default 90)
}

export function HabitHeatmap({ checkins, days = 90 }: HabitHeatmapProps) {
  const today = new Date()
  const checkinMap = useMemo(() => {
    const map = new Map<string, CheckinStatus>()
    checkins.forEach((c) => map.set(c.dateKey, c.status))
    return map
  }, [checkins])

  // Generate array of dates going back `days` days
  const dates = useMemo(() => {
    const result: Array<{ dateKey: string; dayOfWeek: number }> = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      result.push({
        dateKey: d.toISOString().split('T')[0],
        dayOfWeek: d.getDay(),
      })
    }
    return result
  }, [days])

  // Arrange into weeks (columns)
  const weeks = useMemo(() => {
    const result: Array<Array<{ dateKey: string; dayOfWeek: number } | null>> = []
    let currentWeek: Array<{ dateKey: string; dayOfWeek: number } | null> = []

    // Pad the first week with nulls
    if (dates.length > 0) {
      for (let i = 0; i < dates[0].dayOfWeek; i++) {
        currentWeek.push(null)
      }
    }

    for (const date of dates) {
      if (currentWeek.length === 7) {
        result.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push(date)
    }

    // Pad the last week
    while (currentWeek.length < 7) currentWeek.push(null)
    result.push(currentWeek)

    return result
  }, [dates])

  const getColor = (dateKey: string): string => {
    const status = checkinMap.get(dateKey)
    if (!status) return 'var(--background-tertiary)'
    if (status === 'done') return 'var(--success)'
    if (status === 'tiny') return 'var(--warning)'
    return 'var(--background-tertiary)' // skip
  }

  return (
    <div className="habit-heatmap">
      <div className="habit-heatmap__grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="habit-heatmap__week">
            {week.map((day, di) => (
              <div
                key={di}
                className="habit-heatmap__cell"
                style={{ background: day ? getColor(day.dateKey) : 'transparent' }}
                title={day ? `${day.dateKey}: ${checkinMap.get(day.dateKey) || 'no check-in'}` : ''}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="habit-heatmap__legend">
        <span className="habit-heatmap__legend-item">
          <span style={{ background: 'var(--background-tertiary)' }} /> No data
        </span>
        <span className="habit-heatmap__legend-item">
          <span style={{ background: 'var(--warning)' }} /> Tiny
        </span>
        <span className="habit-heatmap__legend-item">
          <span style={{ background: 'var(--success)' }} /> Done
        </span>
      </div>
    </div>
  )
}
```

### A3. Weekly Insights

Create `apps/web-vite/src/components/habits/HabitInsights.tsx`:

```tsx
export function HabitInsights({
  habits,
  allCheckins,
}: {
  habits: CanonicalHabit[]
  allCheckins: CanonicalHabitCheckin[]
}) {
  const insights = useMemo(() => {
    const result: string[] = []

    // Best day of the week
    const dayCompletions = [0, 0, 0, 0, 0, 0, 0] // Sun-Sat
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]

    allCheckins.forEach((c) => {
      if (c.status === 'done' || c.status === 'tiny') {
        const d = new Date(c.dateKey)
        const dow = d.getDay()
        dayCompletions[dow]++
      }
      const d = new Date(c.dateKey)
      dayCounts[d.getDay()]++
    })

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    let bestDay = 0
    let bestRate = 0
    dayCompletions.forEach((count, i) => {
      const rate = dayCounts[i] > 0 ? count / dayCounts[i] : 0
      if (rate > bestRate) {
        bestRate = rate
        bestDay = i
      }
    })

    if (bestRate > 0) {
      result.push(
        `Your best day for habits is ${dayNames[bestDay]} (${Math.round(bestRate * 100)}% completion)`
      )
    }

    // Longest active streak across all habits
    const longestStreak = Math.max(
      ...habits.map((h) => {
        const stats = getHabitStatsUsecase(
          h,
          allCheckins.filter((c) => c.habitId === h.habitId)
        )
        return stats.currentStreak
      }),
      0
    )
    if (longestStreak > 3) {
      result.push(`Your longest active streak is ${longestStreak} days — keep it going!`)
    }

    // Habits at risk (streak about to break)
    habits.forEach((h) => {
      const habitCheckins = allCheckins.filter((c) => c.habitId === h.habitId)
      const stats = getHabitStatsUsecase(h, habitCheckins)
      if (stats.currentStreak >= 5) {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayKey = yesterday.toISOString().split('T')[0]
        const todayKey = new Date().toISOString().split('T')[0]
        const hasYesterday = habitCheckins.some(
          (c) => c.dateKey === yesterdayKey && (c.status === 'done' || c.status === 'tiny')
        )
        const hasToday = habitCheckins.some(
          (c) => c.dateKey === todayKey && (c.status === 'done' || c.status === 'tiny')
        )
        if (!hasToday && hasYesterday) {
          result.push(
            `"${h.title}" has a ${stats.currentStreak}-day streak — don't break it today!`
          )
        }
      }
    })

    return result
  }, [habits, allCheckins])

  if (insights.length === 0) return null

  return (
    <div className="habit-insights">
      <h4>Insights</h4>
      {insights.map((insight, i) => (
        <p key={i} className="habit-insight">
          {insight}
        </p>
      ))}
    </div>
  )
}
```

### A4. Streak & Heatmap CSS

```css
.habit-streak-card {
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--card);
}
.habit-streak-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}
.habit-streak-card__domain {
  font-size: var(--text-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--background-tertiary);
}

.habit-streak-card__stats {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}
.streak-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.streak-stat__value {
  font-size: var(--text-xl);
  font-weight: 700;
  font-family: var(--font-mono);
}
.streak-stat__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.habit-heatmap__grid {
  display: flex;
  gap: 2px;
  overflow-x: auto;
}
.habit-heatmap__week {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.habit-heatmap__cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
.habit-heatmap__legend {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
.habit-heatmap__legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.habit-heatmap__legend-item span:first-child {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.habit-insights {
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
}
.habit-insights h4 {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: var(--space-2);
}
.habit-insight {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--border);
}
.habit-insight:last-child {
  border-bottom: none;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Weekly Review Wizard

### B1. Create `WeeklyReviewPage`

Create `apps/web-vite/src/pages/WeeklyReviewPage.tsx`:

```tsx
type ReviewStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<ReviewStep, string> = {
  1: 'Reflect',
  2: 'Review',
  3: 'Plan',
  4: 'Prepare',
  5: 'Commit',
};

export function WeeklyReviewPage() {
  const [step, setStep] = useState<ReviewStep>(1);
  const [reflections, setReflections] = useState({ wentWell: '', didntGoWell: '', learned: '' });
  const [priorities, setPriorities] = useState<string[]>(['', '', '']);
  const [saving, setSaving] = useState(false);

  // Data for review
  const { tasks } = useTodoOperations({ userId });
  const { habits, checkins } = useHabitOperations();
  const { events } = useCalendarEvents();
  const { createNote } = useNoteOperations();

  // Computed metrics for "Review" step
  const weekMetrics = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const completedTasks = tasks.filter(t => t.completedAtMs && t.completedAtMs > weekAgo);
    const weekCheckins = checkins.filter(c => new Date(c.dateKey).getTime() > weekAgo);
    const doneCheckins = weekCheckins.filter(c => c.status === 'done' || c.status === 'tiny');
    return {
      tasksCompleted: completedTasks.length,
      habitCompletionRate: weekCheckins.length > 0 ? Math.round((doneCheckins.length / weekCheckins.length) * 100) : 0,
      eventsAttended: events.filter(e => e.startMs > weekAgo && e.startMs < Date.now()).length,
    };
  }, [tasks, checkins, events]);

  // Upcoming events/follow-ups for "Prepare" step
  const upcomingEvents = useMemo(() => {
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return events.filter(e => e.startMs > Date.now() && e.startMs < nextWeek).slice(0, 10);
  }, [events]);
```

### B2. Step Content

```tsx
  return (
    <div className="weekly-review">
      {/* Step indicator */}
      <div className="review-steps">
        {([1, 2, 3, 4, 5] as ReviewStep[]).map(s => (
          <div key={s} className={`review-step ${s === step ? 'review-step--active' : ''} ${s < step ? 'review-step--completed' : ''}`}>
            <span className="review-step__number">{s < step ? '✓' : s}</span>
            <span className="review-step__label">{STEP_LABELS[s]}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Reflect */}
      {step === 1 && (
        <div className="review-content">
          <h2>Reflect on the Week</h2>
          <div className="form-group">
            <label>What went well?</label>
            <textarea rows={4} value={reflections.wentWell} onChange={e => setReflections(r => ({ ...r, wentWell: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>What didn't go as planned?</label>
            <textarea rows={4} value={reflections.didntGoWell} onChange={e => setReflections(r => ({ ...r, didntGoWell: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>What did you learn?</label>
            <textarea rows={3} value={reflections.learned} onChange={e => setReflections(r => ({ ...r, learned: e.target.value }))} />
          </div>
        </div>
      )}

      {/* Step 2: Review metrics */}
      {step === 2 && (
        <div className="review-content">
          <h2>Review Your Numbers</h2>
          <div className="review-metrics">
            <div className="review-metric">
              <span className="review-metric__value">{weekMetrics.tasksCompleted}</span>
              <span className="review-metric__label">Tasks completed</span>
            </div>
            <div className="review-metric">
              <span className="review-metric__value">{weekMetrics.habitCompletionRate}%</span>
              <span className="review-metric__label">Habit completion</span>
            </div>
            <div className="review-metric">
              <span className="review-metric__value">{weekMetrics.eventsAttended}</span>
              <span className="review-metric__label">Events attended</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Plan next week */}
      {step === 3 && (
        <div className="review-content">
          <h2>Set Next Week's Priorities</h2>
          <p className="review-hint">What are the 3 most important things to accomplish next week?</p>
          {priorities.map((p, i) => (
            <input
              key={i}
              type="text"
              placeholder={`Priority ${i + 1}`}
              value={p}
              onChange={e => { const next = [...priorities]; next[i] = e.target.value; setPriorities(next); }}
            />
          ))}
        </div>
      )}

      {/* Step 4: Prepare */}
      {step === 4 && (
        <div className="review-content">
          <h2>Prepare for Next Week</h2>
          <h3>Upcoming Events</h3>
          {upcomingEvents.length === 0 ? (
            <p>No events scheduled for next week.</p>
          ) : (
            <ul className="review-events">
              {upcomingEvents.map(e => (
                <li key={e.canonicalEventId}>{e.title} — {formatDate(e.startMs)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Step 5: Commit (save as note) */}
      {step === 5 && (
        <div className="review-content">
          <h2>Save Your Review</h2>
          <p>Your weekly review will be saved as a note for future reference.</p>
          <div className="review-summary">
            <h4>What went well</h4><p>{reflections.wentWell || '(not filled)'}</p>
            <h4>Challenges</h4><p>{reflections.didntGoWell || '(not filled)'}</p>
            <h4>Lessons</h4><p>{reflections.learned || '(not filled)'}</p>
            <h4>Priorities</h4>
            <ul>{priorities.filter(Boolean).map((p, i) => <li key={i}>{p}</li>)}</ul>
            <h4>Metrics</h4>
            <p>{weekMetrics.tasksCompleted} tasks · {weekMetrics.habitCompletionRate}% habits · {weekMetrics.eventsAttended} events</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="review-nav">
        {step > 1 && <button className="ghost-button" onClick={() => setStep((step - 1) as ReviewStep)}>Back</button>}
        <div style={{ flex: 1 }} />
        {step < 5 ? (
          <button className="primary-button" onClick={() => setStep((step + 1) as ReviewStep)}>Next</button>
        ) : (
          <button className="primary-button" onClick={handleSaveReview} disabled={saving}>
            {saving ? 'Saving...' : 'Save Review'}
          </button>
        )}
      </div>
    </div>
  );
}
```

### B3. Save Review as Note

```ts
const handleSaveReview = async () => {
  setSaving(true)
  const weekLabel = `Week of ${formatDate(Date.now() - 6 * 86400000)} — ${formatDate(Date.now())}`

  const html = `
    <h2>Reflections</h2>
    <h3>What went well</h3><p>${reflections.wentWell}</p>
    <h3>Challenges</h3><p>${reflections.didntGoWell}</p>
    <h3>Lessons learned</h3><p>${reflections.learned}</p>
    <h2>Metrics</h2>
    <ul>
      <li>Tasks completed: ${weekMetrics.tasksCompleted}</li>
      <li>Habit completion: ${weekMetrics.habitCompletionRate}%</li>
      <li>Events attended: ${weekMetrics.eventsAttended}</li>
    </ul>
    <h2>Next Week Priorities</h2>
    <ol>${priorities
      .filter(Boolean)
      .map((p) => `<li>${p}</li>`)
      .join('')}</ol>
  `

  await createNote({
    title: `Weekly Review — ${weekLabel}`,
    contentHtml: html,
    tags: ['weekly-review'],
  })
  setSaving(false)
  navigate('/notes')
}
```

### B4. Add Route

In `App.tsx`:

```tsx
<Route path="/review" element={<WeeklyReviewPage />} />
```

Add a "Weekly Review" link to the Today page or nav.

### B5. Review CSS

```css
.weekly-review {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-6);
}
.review-steps {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}
.review-step {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-tertiary);
}
.review-step--active {
  color: var(--foreground);
  font-weight: 600;
}
.review-step--completed {
  color: var(--success);
}
.review-step__number {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 2px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: 600;
}
.review-step--active .review-step__number {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-foreground);
}
.review-step--completed .review-step__number {
  background: var(--success);
  border-color: var(--success);
  color: white;
}
.review-step__label {
  font-size: var(--text-sm);
}

.review-content {
  min-height: 300px;
}
.review-content h2 {
  margin-bottom: var(--space-4);
}
.review-hint {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
}
.review-metrics {
  display: flex;
  gap: var(--space-5);
  margin: var(--space-4) 0;
}
.review-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  flex: 1;
}
.review-metric__value {
  font-size: var(--text-2xl);
  font-weight: 700;
  font-family: var(--font-mono);
}
.review-metric__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.review-summary {
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--card);
}
.review-summary h4 {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-top: var(--space-3);
}
.review-nav {
  display: flex;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
  margin-top: var(--space-4);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Quality Gates (run after ALL phases)

```bash
pnpm typecheck
pnpm lint --fix
pnpm vitest run --reporter=verbose apps/web-vite
pnpm build
```

---

## Tests

Create `apps/web-vite/src/components/habits/__tests__/HabitHeatmap.test.tsx`:

1. **Renders 90 days** — Default 90-day heatmap renders correct number of cells
2. **Done days are green** — Check-in with 'done' → cell has success color
3. **Tiny days are yellow** — Check-in with 'tiny' → cell has warning color
4. **Empty days are grey** — No check-in → cell has tertiary color
5. **Legend renders** — Verify "No data", "Tiny", "Done" legend items

Create `apps/web-vite/src/components/habits/__tests__/HabitInsights.test.tsx`:

6. **Best day insight** — Habit completed every Tuesday → "Your best day is Tuesday" shown
7. **Streak at risk** — 7-day streak, no check-in today → warning insight shown

Create `apps/web-vite/src/pages/__tests__/WeeklyReviewPage.test.tsx`:

8. **Step navigation** — Click Next → step 2 visible, click Back → step 1
9. **Metrics show data** — With completed tasks → metric cards show counts
10. **Save creates note** — Fill review + save → note created with correct title and tags

---

## Commit

```
feat(habits): streak heatmap, weekly insights, guided weekly review wizard

- HabitStreakCard: current streak, best streak, completion rate display
- 90-day GitHub-style heatmap with done/tiny/empty color coding
- Weekly insights: best day analysis, streak-at-risk warnings
- 5-step Weekly Review wizard: Reflect → Review → Plan → Prepare → Commit
- Review shows task/habit/event metrics for the past week
- Priorities for next week (top 3)
- Saves completed review as a dated note with weekly-review tag

Co-Authored-By: Claude <noreply@anthropic.com>
```
