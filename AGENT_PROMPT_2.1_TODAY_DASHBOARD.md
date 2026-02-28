# Agent Prompt — Task 2.1: Today Page — Command Center Redesign

> **Scope:** Restructure the Today page from a vertically-scrolling card stack into a compact 2-column dashboard grid that fits above the fold on 1080p, add quick-actions to priority tasks, compact the calendar preview and metrics bar.

---

## 0. Context & References

| Item                     | Path (relative to repo root)                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| **Design tokens**        | `apps/web-vite/src/tokens.css`                                              |
| **UI primitives**        | `apps/web-vite/src/components/ui/` (Modal, Card, Badge, etc.)               |
| **Today page**           | `apps/web-vite/src/pages/TodayPage.tsx` (~540 lines)                        |
| **Today CSS (globals)**  | `apps/web-vite/src/globals.css` — `.today-*` classes at lines 5638-6608     |
| **CheckInCard**          | `apps/web-vite/src/components/mind/CheckInCard.tsx`                         |
| **CheckInCard CSS**      | `apps/web-vite/src/styles/components/CheckInCard.css`                       |
| **FollowUpWidget**       | `apps/web-vite/src/components/contacts/FollowUpWidget.tsx`                  |
| **FollowUpWidget CSS**   | `apps/web-vite/src/styles/components/FollowUpWidget.css`                    |
| **MessageMailbox**       | `apps/web-vite/src/components/mailbox/MessageMailbox.tsx`                   |
| **MessageMailbox CSS**   | `apps/web-vite/src/styles/components/MessageMailbox.css`                    |
| **HabitCheckInCard**     | `apps/web-vite/src/components/habits/HabitCheckInCard.tsx`                  |
| **IncantationDisplay**   | `apps/web-vite/src/components/habits/IncantationDisplay.tsx`                |
| **TodayWorkout**         | `apps/web-vite/src/components/training/TodayWorkout.tsx`                    |
| **WorkoutSessionCard**   | `apps/web-vite/src/components/training/WorkoutSessionCard.tsx`              |
| **MeetingBriefingModal** | `apps/web-vite/src/components/contacts/MeetingBriefingModal.tsx`            |
| **Hooks**                | `useCalendarEvents`, `useTodoOperations`, `useTrainingToday`, `useAutoSync` |

**Current grid layout** (globals.css line 5728):

```css
.today-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  grid-template-rows: auto 1fr auto auto;
  gap: 1.5rem;
}
```

**Current grid positions:**

- Row 1, Col 1: CheckInCard (`.today-grid-checkin`)
- Row 1, Col 2: Daily State — quote/time/incantations (`.today-grid-state`)
- Row 2, Col 1: Top Priority Tasks (`.today-grid-tasks`)
- Row 2, Col 2: Calendar Preview (`.today-grid-calendar`)
- Row 3, Col 1: MessageMailbox (in MessageMailbox.css `.today-grid-mailbox`)
- Row 3, Col 2: Daily Momentum — habits + workouts (`.today-grid-momentum`)
- Row 4, Full: Follow-Ups Due (`.today-grid-followup`)
- Bottom: TelemetryBar

---

## Phase A — Restructure Grid Layout (2-column command center)

### A1. New Grid Definition

Replace the current `.today-layout` grid in `globals.css` (~line 5728-5734) with:

```css
.today-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  grid-template-rows: auto auto auto auto;
  gap: var(--space-4);
  align-items: start;
}
```

### A2. Move Daily Metrics to Top

**Currently:** TelemetryBar is rendered at the bottom of `TodayPage.tsx` (~line 521).

**Change:** Move the TelemetryBar render to immediately after the page header (before `.today-layout`). It should be a single compact row above the grid:

```css
.today-telemetry {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
}

.today-telemetry__pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: var(--background-tertiary);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.today-telemetry__pill:hover {
  background: var(--accent-subtle);
  color: var(--accent);
}
```

Each metric pill should navigate to its page on click:

- MTG → `/calendar`
- FREE → `/calendar`
- UTIL → `/planner`
- EXERCISE → `/plan`

### A3. New Grid Positions

Update the grid-area CSS classes and the JSX render order in `TodayPage.tsx`:

| Position | Left column (3fr)                                  | Right column (2fr)                       |
| -------- | -------------------------------------------------- | ---------------------------------------- |
| Row 1    | CheckInCard                                        | Daily State (quote + time + incantation) |
| Row 2    | Top Priority Tasks                                 | Calendar Preview                         |
| Row 3    | Mailbox Widget                                     | Daily Momentum (Habits + Workouts)       |
| Row 4    | Follow-Ups Due (full-width, `grid-column: 1 / -1`) | —                                        |

This is similar to the current layout but enforce `align-items: start` so right-column cards don't stretch to match left-column height.

### A4. Daily State Card — Combine Into One Compact Card

**Currently:** The Daily State card contains subsections for time, quote, and incantation display spread vertically.

**Change:** Combine into a single card with:

- **Top:** System time + timezone (one line, `--font-mono`, `--text-sm`)
- **Middle:** Quote text (italic, `--text-base`) + author (`--text-xs`, `--text-tertiary`)
- **Bottom:** Incantation as a collapsible section (collapsed by default, expand via "View Incantations" link)

This reduces the vertical space the Daily State card consumes.

### A5. Collapsible Card Headers

Each `.today-card` should have a header that shows a summary even when collapsed:

```tsx
<Card>
  <details open>
    <summary className="today-card-header">
      <h3>Top Priorities</h3>
      <span className="today-card-summary">3 tasks · 1 frog</span>
    </summary>
    <div className="today-card-body">{/* card content */}</div>
  </details>
</Card>
```

CSS for collapsibility:

```css
.today-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  list-style: none;
  padding: var(--space-3) var(--space-4);
}

.today-card-header::-webkit-details-marker {
  display: none;
}

.today-card-header::after {
  content: '▸';
  transition: transform var(--motion-fast) var(--motion-ease);
}

details[open] > .today-card-header::after {
  transform: rotate(90deg);
}

.today-card-summary {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}
```

Apply to: Check-In, Top Priorities, Calendar Preview, Mailbox, Daily Momentum, Follow-Ups.

**Quality gate:** Run `pnpm typecheck && pnpm lint --fix` after Phase A.

---

## Phase B — Priority Tasks Quick Actions

### B1. Inline Task Quick Actions

In `TodayPage.tsx`, the priority tasks section (~lines 334-460) renders each task as a card. Add inline quick action buttons to each task row:

```tsx
<div className="today-task-row">
  <button className="today-task-checkbox" onClick={() => completeTask(task.id)}>
    {task.completed ? '✓' : '○'}
  </button>
  <div className="today-task-info">
    <span className="today-task-title">{task.title}</span>
    {task.dueDate && <span className="today-task-due">{formatRelative(task.dueDate)}</span>}
  </div>
  <div className="today-task-actions">
    <button
      className="today-task-action"
      title="Snooze to tomorrow"
      onClick={() => snoozeTask(task.id)}
    >
      ⏭
    </button>
    <button className="today-task-action" title="Start timer" onClick={() => startTimer(task.id)}>
      ▶
    </button>
  </div>
</div>
```

### B2. "The Frog" Visual Distinction

The highest-priority task ("The Frog") should be visually distinct:

```css
.today-frog-task {
  padding: var(--space-3) var(--space-4);
  background: var(--accent-subtle);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}

.today-frog-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-1);
}
```

Render the frog task above the regular task list with a label like "EAT THE FROG" or "TOP PRIORITY".

### B3. Quick-Add Input

Always show a quick-add input at the bottom of the priority tasks card:

```tsx
<div className="today-quick-add">
  <input
    type="text"
    placeholder="+ Add a task for today..."
    className="today-quick-add__input"
    onKeyDown={(e) => {
      if (e.key === 'Enter') createTask(e.currentTarget.value)
    }}
  />
</div>
```

### B4. Implement `snoozeTask`

Add a `snoozeTask(taskId)` handler to `TodayPage.tsx` that:

1. Updates the task's urgency to `'this_week'` (removing it from today's view)
2. Optionally sets the due date to tomorrow
3. Shows a toast: "Task snoozed to tomorrow"

Use the existing `useTodoOperations().updateTodo()` method.

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Calendar Preview Compaction

### C1. Limit to 5 Events

In the calendar preview section of `TodayPage.tsx` (~lines 370-430), currently all today's events are shown. Change to:

```tsx
const previewEvents = todayEvents.slice(0, 5)
const remainingCount = todayEvents.length - previewEvents.length
```

### C2. One-Line Event Display

Each event should be a single line:

```tsx
<div className="today-event-row">
  <span className="today-event-time">{formatTime(event.startMs)}</span>
  <span className="today-event-title">{event.title}</span>
  {event.attendees?.length > 0 && (
    <span className="today-event-guests">{event.attendees.length}</span>
  )}
</div>
```

```css
.today-event-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-size: var(--text-sm);
}

.today-event-time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  min-width: 48px;
}

.today-event-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.today-event-guests {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  background: var(--background-tertiary);
  padding: 1px 6px;
  border-radius: var(--radius-full);
}
```

### C3. Current/Next Event Highlight

Highlight the current or next event:

```css
.today-event-row--current {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-2);
  font-weight: 500;
}
```

### C4. "See Full Calendar" Link

At the bottom of the calendar preview card:

```tsx
{
  remainingCount > 0 && (
    <Link to="/calendar" className="today-see-more">
      +{remainingCount} more events → See full calendar
    </Link>
  )
}
{
  remainingCount === 0 && todayEvents.length > 0 && (
    <Link to="/calendar" className="today-see-more">
      See full calendar →
    </Link>
  )
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase D — Responsive Breakpoints

### D1. Mobile Layout

Add media queries in globals.css after the today-layout grid:

```css
@media (max-width: 768px) {
  .today-layout {
    grid-template-columns: 1fr;
  }

  .today-grid-followup {
    grid-column: 1;
  }

  .today-telemetry {
    flex-wrap: wrap;
  }
}
```

### D2. Tablet Layout

```css
@media (min-width: 769px) and (max-width: 1024px) {
  .today-layout {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
}
```

---

## Quality Gates (run after ALL phases)

```bash
pnpm typecheck
pnpm lint --fix
pnpm vitest run --reporter=verbose apps/web-vite
pnpm build
```

If any step fails, fix the issue before proceeding.

---

## Tests

Create or update `apps/web-vite/src/pages/__tests__/TodayPage.test.tsx`:

1. **Renders without crash** — TodayPage renders with mocked hooks
2. **Metrics bar renders** — Verify `.today-telemetry` is present and contains pill elements
3. **Priority tasks display** — Verify frog task renders with `.today-frog-task` class
4. **Calendar preview limits** — With 8 events, only 5 render plus a "more" link
5. **Quick-add input** — Verify the quick-add input is present
6. **Collapsible sections** — Verify `<details>` elements exist and are open by default

Mock all hooks (`useAuth`, `useTodoOperations`, `useCalendarEvents`, `useTrainingToday`, `useAutoSync`) with sensible defaults.

---

## Commit

After all phases pass quality gates:

```
feat(today): restructure dashboard as 2-column command center

- Move daily metrics to compact pill bar at top
- Add inline quick actions to priority tasks (complete, snooze, timer)
- Visual distinction for "The Frog" task
- Compact calendar preview (5 events max, one-line format)
- Collapsible card sections with summary counts
- Responsive breakpoints for mobile/tablet

Co-Authored-By: Claude <noreply@anthropic.com>
```
