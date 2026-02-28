# Agent Prompt — Task 3.5: AI Workflows & Automation — Scheduling, Triggers & Output

> **Scope:** Enable cron-like scheduled workflow runs, event-driven workflow triggers, and auto-saving workflow output as notes.
>
> **Deferred:** Personal AI Assistant (3.5.4) — a conversational "Ask LifeOS" interface is an XL initiative that needs its own project scope. It requires a retrieval-augmented generation pipeline across all data domains, which is premature before the individual domain features are stable.

---

## 0. Context & References

| Item                    | Path (relative to repo root)                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Design tokens**       | `apps/web-vite/src/tokens.css`                                                                      |
| **UI primitives**       | `apps/web-vite/src/components/ui/`                                                                  |
| **Workflow model**      | `packages/agents/src/domain/models.ts` — `Workflow`, `Run`, `RunStatus`, `WorkflowGraph`            |
| **Workflow state**      | `packages/agents/src/domain/workflowState.ts`                                                       |
| **Workflow repository** | `packages/agents/src/ports/workflowRepository.ts`                                                   |
| **Run repository**      | `packages/agents/src/ports/runRepository.ts`                                                        |
| **Workflow executor**   | `functions/src/agents/workflowExecutor.ts` — LangGraph execution, Firestore trigger on run creation |
| **Run executor**        | `functions/src/agents/runExecutor.ts`                                                               |
| **Run events**          | `functions/src/agents/runEvents.ts`                                                                 |
| **WorkflowDetailPage**  | `apps/web-vite/src/pages/WorkflowDetailPage.tsx`                                                    |
| **RunCard**             | `apps/web-vite/src/components/agents/RunCard.tsx`                                                   |
| **Workflow hooks**      | `apps/web-vite/src/hooks/useWorkflowOperations.ts`, `useRunEvents.ts`                               |
| **Note model**          | `packages/notes/src/domain/models.ts` — `Note`                                                      |
| **Cloud Functions**     | `functions/src/index.ts`                                                                            |
| **Firebase config**     | `firebase.json`                                                                                     |

**Current state:** Workflows execute via Firestore trigger when a Run document is created at `/users/{userId}/workflows/{workflowId}/runs/{runId}`. Runs have `status`, `output`, `tokensUsed`, `estimatedCost`. No scheduling. No event triggers. No auto-note creation.

**Execution pattern:** Client creates a Run document → Firestore `onDocumentCreated` trigger → `workflowExecutor` processes the run → updates Run status/output.

---

## Phase A — Scheduled Workflow Runs

### A1. Schedule Model

Add to `packages/agents/src/domain/models.ts`:

```ts
export interface WorkflowSchedule {
  scheduleId: string
  workflowId: string
  userId: string
  enabled: boolean
  cron: string // Simplified: 'daily_09:00' | 'weekly_mon_09:00' | 'custom'
  cronExpression?: string // For custom: standard cron syntax
  timezone: string
  goal: string // What to pass as Run.goal
  context?: Record<string, unknown> // Additional context for the run
  lastRunAtMs?: number
  nextRunAtMs?: number
  createdAtMs: number
  updatedAtMs: number
}

// Convenience schedule options:
export type SchedulePreset =
  | 'daily'
  | 'weekdays'
  | 'weekly_monday'
  | 'weekly_friday'
  | 'monthly_first'
  | 'custom'

export const SCHEDULE_PRESETS: Record<SchedulePreset, { label: string; description: string }> = {
  daily: { label: 'Daily', description: 'Every day at a specified time' },
  weekdays: { label: 'Weekdays', description: 'Monday through Friday' },
  weekly_monday: { label: 'Weekly (Monday)', description: 'Every Monday' },
  weekly_friday: { label: 'Weekly (Friday)', description: 'Every Friday' },
  monthly_first: { label: 'Monthly', description: '1st of each month' },
  custom: { label: 'Custom', description: 'Custom cron expression' },
}
```

Firestore path: `/users/{userId}/workflows/{workflowId}/schedules/{scheduleId}`

### A2. Scheduled Runner Cloud Function

Create `functions/src/agents/workflowScheduler.ts`:

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler'

// Runs every 15 minutes, checks for due schedules
export const workflowSchedulerTick = onSchedule('every 15 minutes', async () => {
  const now = Date.now()
  const dueSchedules = await getDueSchedules(now)

  for (const schedule of dueSchedules) {
    if (!schedule.enabled) continue

    // Create a new Run
    const run: Partial<Run> = {
      workflowId: schedule.workflowId,
      userId: schedule.userId,
      goal: schedule.goal,
      context: { ...schedule.context, scheduledRun: true, scheduleId: schedule.scheduleId },
      status: 'pending',
      startedAtMs: now,
    }

    await createRun(schedule.userId, schedule.workflowId, run)

    // Update schedule with lastRunAtMs and compute nextRunAtMs
    await updateSchedule(schedule.userId, schedule.workflowId, schedule.scheduleId, {
      lastRunAtMs: now,
      nextRunAtMs: computeNextRunTime(schedule, now),
    })
  }
})

function computeNextRunTime(schedule: WorkflowSchedule, fromMs: number): number {
  // Parse the cron/preset and calculate next occurrence
  // For 'daily_09:00': next day at 09:00 in the schedule's timezone
  // For 'weekly_mon_09:00': next Monday at 09:00
  // For custom: use a cron parser library
}
```

### A3. Schedule UI in WorkflowDetailPage

Add a "Scheduled" tab or section to `WorkflowDetailPage.tsx`:

```tsx
<details className="workflow-section">
  <summary className="workflow-section__header">
    <h3>Scheduled Runs</h3>
    <span className="workflow-section__summary">
      {schedules.filter((s) => s.enabled).length} active
    </span>
  </summary>
  <div className="workflow-section__body">
    <button className="ghost-button" onClick={() => setShowScheduleForm(true)}>
      + Add Schedule
    </button>

    {schedules.map((schedule) => (
      <div key={schedule.scheduleId} className="schedule-card">
        <div className="schedule-card__info">
          <span className="schedule-card__preset">{getPresetLabel(schedule)}</span>
          <span className="schedule-card__goal">{schedule.goal}</span>
          {schedule.lastRunAtMs && (
            <span className="schedule-card__last-run">
              Last run: {formatRelative(schedule.lastRunAtMs)}
            </span>
          )}
          {schedule.nextRunAtMs && (
            <span className="schedule-card__next-run">
              Next: {formatRelative(schedule.nextRunAtMs)}
            </span>
          )}
        </div>
        <div className="schedule-card__actions">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={() => toggleSchedule(schedule)}
            />
            <span>{schedule.enabled ? 'Active' : 'Paused'}</span>
          </label>
          <button className="ghost-button" onClick={() => deleteSchedule(schedule.scheduleId)}>
            Delete
          </button>
        </div>
      </div>
    ))}
  </div>
</details>
```

### A4. Schedule Form Modal

```tsx
// Fields: preset (select), time (HH:MM), timezone (select), goal (textarea), context (optional JSON)
// For custom preset: show cron expression input
```

### A5. Schedule CSS

```css
.schedule-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-2);
}
.schedule-card__info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.schedule-card__preset {
  font-size: var(--text-sm);
  font-weight: 600;
}
.schedule-card__goal {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.schedule-card__last-run,
.schedule-card__next-run {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.schedule-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Event-Triggered Workflows

### B1. Trigger Model

Add to `packages/agents/src/domain/models.ts`:

```ts
export type TriggerEventType =
  | 'contact_created'
  | 'contact_circle_changed'
  | 'meeting_ended'
  | 'task_completed'
  | 'message_received'
  | 'follow_up_due'

export interface WorkflowTrigger {
  triggerId: string
  workflowId: string
  userId: string
  eventType: TriggerEventType
  conditions?: Record<string, unknown> // Optional filters, e.g., { circle: 0 } for Core contacts only
  goal: string // Template for Run.goal, can include {contact.name}, {task.title}, etc.
  enabled: boolean
  createdAtMs: number
  updatedAtMs: number
}

export interface TriggerExecution {
  executionId: string
  triggerId: string
  eventType: TriggerEventType
  eventData: Record<string, unknown>
  runId?: string // The Run created by this trigger
  status: 'fired' | 'completed' | 'failed'
  createdAtMs: number
}
```

Firestore paths:

- `/users/{userId}/workflows/{workflowId}/triggers/{triggerId}`
- `/users/{userId}/triggerHistory/{executionId}`

### B2. Event Dispatcher

Create `functions/src/agents/triggerDispatcher.ts`:

```ts
// Called from various Firestore triggers across the app
export async function dispatchTriggerEvent(
  userId: string,
  eventType: TriggerEventType,
  eventData: Record<string, unknown>
) {
  // Find all enabled triggers matching this event type
  const triggers = await getTriggersForEvent(userId, eventType)

  for (const trigger of triggers) {
    // Check conditions
    if (trigger.conditions && !matchesConditions(trigger.conditions, eventData)) continue

    // Interpolate goal template
    const goal = interpolateGoal(trigger.goal, eventData)

    // Create a Run
    const run = await createRun(userId, trigger.workflowId, {
      goal,
      context: { triggerId: trigger.triggerId, eventType, eventData },
      status: 'pending',
      startedAtMs: Date.now(),
    })

    // Log execution
    await logTriggerExecution(userId, {
      triggerId: trigger.triggerId,
      eventType,
      eventData,
      runId: run.runId,
      status: 'fired',
      createdAtMs: Date.now(),
    })
  }
}
```

### B3. Wire Triggers to Existing Events

In existing Firestore triggers throughout the codebase, add dispatch calls:

```ts
// In contacts — when a new contact is created:
await dispatchTriggerEvent(userId, 'contact_created', { contactId, displayName, circle })

// In calendar — when a meeting ends (based on endMs passing):
await dispatchTriggerEvent(userId, 'meeting_ended', { eventId, title, attendees })

// In tasks — when a task is marked complete:
await dispatchTriggerEvent(userId, 'task_completed', { taskId, title, projectId })
```

### B4. Trigger UI in WorkflowDetailPage

```tsx
<details className="workflow-section">
  <summary className="workflow-section__header">
    <h3>Triggers</h3>
    <span className="workflow-section__summary">
      {triggers.filter((t) => t.enabled).length} active
    </span>
  </summary>
  <div className="workflow-section__body">
    <button className="ghost-button" onClick={() => setShowTriggerForm(true)}>
      + Add Trigger
    </button>

    {triggers.map((trigger) => (
      <div key={trigger.triggerId} className="trigger-card">
        <span className="trigger-card__event">{TRIGGER_EVENT_LABELS[trigger.eventType]}</span>
        <span className="trigger-card__goal">{trigger.goal}</span>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={trigger.enabled}
            onChange={() => toggleTrigger(trigger)}
          />
        </label>
      </div>
    ))}

    {/* Trigger history */}
    {triggerHistory.length > 0 && (
      <div className="trigger-history">
        <h4>Recent Executions</h4>
        {triggerHistory.slice(0, 10).map((exec) => (
          <div key={exec.executionId} className="trigger-history__entry">
            <span className={`trigger-history__status trigger-history__status--${exec.status}`}>
              {exec.status}
            </span>
            <span>{TRIGGER_EVENT_LABELS[exec.eventType]}</span>
            <span className="trigger-history__date">{formatRelative(exec.createdAtMs)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
</details>
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Workflow Output to Notes

### C1. Output Configuration on Workflow

Add to the `Workflow` model:

```ts
// Add to Workflow:
outputConfig?: {
  autoCreateNote: boolean;
  targetTopicId?: string; // Which notes topic to file under
  noteTagPrefix?: string; // e.g., 'workflow-output'
};
```

### C2. Auto-Note Creation on Run Completion

In `workflowExecutor.ts`, after a run completes successfully, check if the workflow has `outputConfig.autoCreateNote`:

```ts
// After run completes with output:
if (workflow.outputConfig?.autoCreateNote && run.output) {
  const noteTitle = `${workflow.name} — ${new Date(run.completedAtMs!).toLocaleDateString()}`

  const noteContent = formatWorkflowOutputAsHtml(workflow, run)

  await createNote(run.userId, {
    title: noteTitle,
    contentHtml: noteContent,
    tags: [
      workflow.outputConfig.noteTagPrefix || 'workflow-output',
      workflow.name.toLowerCase().replace(/\s+/g, '-'),
    ],
    topicId: workflow.outputConfig.targetTopicId || null,
    // Link back to the run
    metadata: { sourceWorkflowId: workflow.workflowId, sourceRunId: run.runId },
  })
}

function formatWorkflowOutputAsHtml(workflow: Workflow, run: Run): string {
  let html = `<p><em>Generated by workflow "${workflow.name}" on ${new Date(run.completedAtMs!).toLocaleString()}</em></p>`
  html += `<p><em>Tokens: ${run.tokensUsed || 'N/A'} · Cost: $${(run.estimatedCost || 0).toFixed(4)}</em></p>`
  html += '<hr>'

  // For deep research workflows, format with citations
  if (workflow.workflowType === 'deep_research') {
    html += formatDeepResearchOutput(run.output!)
  } else {
    html += `<div>${run.output}</div>`
  }

  return html
}
```

### C3. Output Config UI

In `WorkflowFormModal.tsx` or WorkflowDetailPage settings, add output configuration:

```tsx
<div className="form-group">
  <label>
    <input
      type="checkbox"
      checked={outputConfig.autoCreateNote}
      onChange={(e) => setOutputConfig({ ...outputConfig, autoCreateNote: e.target.checked })}
    />
    Auto-save output as note
  </label>
  {outputConfig.autoCreateNote && (
    <>
      <select
        value={outputConfig.targetTopicId}
        onChange={(e) => setOutputConfig({ ...outputConfig, targetTopicId: e.target.value })}
      >
        <option value="">Unassigned</option>
        {topics.map((t) => (
          <option key={t.topicId} value={t.topicId}>
            {t.name}
          </option>
        ))}
      </select>
    </>
  )}
</div>
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Quality Gates (run after ALL phases)

```bash
pnpm typecheck
pnpm lint --fix
pnpm vitest run --reporter=verbose apps/web-vite
pnpm vitest run --reporter=verbose functions
pnpm build
```

---

## Tests

Create `functions/src/agents/__tests__/workflowScheduler.test.ts`:

1. **Fires due schedules** — Schedule with `nextRunAtMs` in the past → Run created
2. **Skips disabled schedules** — `enabled: false` → no Run created
3. **Computes next run time** — After daily run, next is +24h

Create `functions/src/agents/__tests__/triggerDispatcher.test.ts`:

4. **Dispatches matching triggers** — `contact_created` event → matching trigger fires
5. **Respects conditions** — Trigger with `{ circle: 0 }`, event with `circle: 2` → no fire
6. **Interpolates goal** — Goal template `"Research {contact.name}"` → `"Research John"`
7. **Logs execution** — After trigger fires → execution record created

Create `functions/src/agents/__tests__/workflowOutputNote.test.ts`:

8. **Creates note on completion** — Workflow with `autoCreateNote: true` → note created
9. **Note has correct tags** — Verify workflow-output tag and workflow name tag
10. **No note without config** — Workflow without `outputConfig` → no note

---

## Commit

```
feat(workflows): scheduled runs, event triggers, auto-save output as notes

- Cron-like scheduled workflow runs (daily, weekly, monthly, custom)
- Cloud Scheduler function checks every 15 min for due schedules
- Schedule CRUD UI in WorkflowDetailPage with enable/disable toggle
- Event-triggered workflows: contact_created, meeting_ended, task_completed, etc.
- Trigger dispatcher with condition matching and goal interpolation
- Trigger execution history log
- Workflow output auto-saved as note with tags and topic assignment
- Deep research output formatted with citations

Co-Authored-By: Claude <noreply@anthropic.com>
```
