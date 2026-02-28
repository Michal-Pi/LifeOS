# Agent Prompt — Task 2.5: Planner — Focused Task Management

> **Scope:** Simplify the Planner tab bar (remove Training/Phases/Life), add a Kanban board view, improve priority grouping, and clean up the project sidebar.

---

## 0. Context & References

| Item                  | Path (relative to repo root)                                               |
| --------------------- | -------------------------------------------------------------------------- |
| **Design tokens**     | `apps/web-vite/src/tokens.css`                                             |
| **UI primitives**     | `apps/web-vite/src/components/ui/`                                         |
| **PlannerPage**       | `apps/web-vite/src/pages/PlannerPage.tsx` (~1,257 lines)                   |
| **TaskList**          | `apps/web-vite/src/components/TaskList.tsx`                                |
| **TaskList CSS**      | `apps/web-vite/src/components/TaskList.css` (277 lines)                    |
| **TaskFormModal**     | `apps/web-vite/src/components/TaskFormModal.tsx`                           |
| **TaskFormModal CSS** | `apps/web-vite/src/styles/components/TaskFormModal.css` (318 lines)        |
| **ProjectList**       | `apps/web-vite/src/components/ProjectList.tsx`                             |
| **PriorityView**      | `apps/web-vite/src/components/PriorityView.tsx`                            |
| **TaskDetailSidebar** | `apps/web-vite/src/components/TaskDetailSidebar.tsx`                       |
| **DomainBarChart**    | `apps/web-vite/src/components/DomainBarChart.tsx`                          |
| **SegmentedControl**  | `apps/web-vite/src/components/SegmentedControl.tsx`                        |
| **taskStats**         | `apps/web-vite/src/lib/taskStats.ts` (122 lines)                           |
| **Hooks**             | `useTodoOperations`, `useTodoSync`, `useWorkoutPlan`, `useHabitOperations` |
| **CSS (globals)**     | `apps/web-vite/src/globals.css` — planner at lines 1126-1495, 8911-9244    |

**Current tabs:** SegmentedControl with 3 options: `tasks`, `training`, `habits` (lines 580-590).

**Current view modes within Tasks:** `priority` (default) and `list` (toggle at lines 115, 127-135).

**Current project sidebar:** Expandable tree with projects → chapters → task counts.

---

## Phase A — Simplify the Tab Bar

### A1. Remove Training and Habits Tabs

In `PlannerPage.tsx`, the `SegmentedControl` (lines 580-590) currently shows `tasks | training | habits`.

**Change:** Remove the SegmentedControl entirely since the Planner should focus solely on task management. Training lives at `/plan` and `/exercises`. Habits live at `/habits`.

1. Remove the `plannerSection` state and the `handlePlannerSectionChange` function (lines 96-100, 137-146)
2. Remove the training section render block (lines 1068-1173)
3. Remove the habits section render block (lines 649-802)
4. Remove the training/habits action buttons from the actions bar (lines 626-645)
5. Remove unused imports: `useWorkoutPlan`, `useHabitOperations`, `HabitCheckInCard`, `TodayWorkout`, `WorkoutSessionCard`, `useWorkoutOperations`

The Planner page now only shows the Tasks view.

### A2. Simplify the Actions Bar

The actions bar should now only contain task-related buttons:

```tsx
<div className="planner-actions-bar">
  <div className="planner-actions-left">
    {/* View mode toggle */}
    <SegmentedControl
      value={viewMode}
      options={[
        { value: 'priority', label: 'Priority' },
        { value: 'list', label: 'List' },
        { value: 'board', label: 'Board' },
      ]}
      onChange={setViewMode}
    />
  </div>
  <div className="planner-actions-right">
    {selectedProject && (
      <button className="ghost-button" onClick={openChapterModal}>
        + Chapter
      </button>
    )}
    <button className="ghost-button" onClick={openProjectModal}>
      + Project
    </button>
    <button className="primary-button" onClick={openTaskModal}>
      + Task
    </button>
  </div>
</div>
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Kanban Board View

### B1. Create `KanbanView` Component

Create `apps/web-vite/src/components/KanbanView.tsx`:

```tsx
interface KanbanViewProps {
  tasks: Todo[]
  onTaskClick: (task: Todo) => void
  onStatusChange: (taskId: string, newStatus: string) => void
  getProjectColor: (projectId?: string) => string
}

type KanbanColumn = 'inbox' | 'active' | 'in_progress' | 'done'

const COLUMNS: { key: KanbanColumn; label: string; statuses: string[] }[] = [
  { key: 'inbox', label: 'Inbox', statuses: ['inbox', 'pending'] },
  { key: 'active', label: 'Active', statuses: ['active', 'todo'] },
  { key: 'in_progress', label: 'In Progress', statuses: ['in_progress', 'started'] },
  { key: 'done', label: 'Done', statuses: ['completed', 'done'] },
]
```

### B2. Kanban Card

Each task card in the board shows:

- Title (truncated to 2 lines)
- Project color dot
- Priority badge
- Due date (if within 7 days)

```tsx
<div
  className="kanban-card"
  onClick={() => onTaskClick(task)}
  draggable
  onDragStart={(e) => handleDragStart(e, task)}
>
  <div className="kanban-card__header">
    {task.projectColor && (
      <span className="kanban-card__dot" style={{ background: task.projectColor }} />
    )}
    <span className="kanban-card__title">{task.title}</span>
  </div>
  <div className="kanban-card__meta">
    {task.priority && (
      <span className={`kanban-card__priority kanban-card__priority--${task.urgency}`}>
        {task.urgency}
      </span>
    )}
    {isWithin7Days(task.dueDate) && (
      <span className="kanban-card__due">{formatRelative(task.dueDate)}</span>
    )}
  </div>
</div>
```

### B3. Drag-and-Drop Between Columns

Implement HTML5 drag-and-drop:

```tsx
const handleDragStart = (e: React.DragEvent, task: Todo) => {
  e.dataTransfer.setData('taskId', task.id)
}

const handleDrop = (e: React.DragEvent, columnKey: KanbanColumn) => {
  e.preventDefault()
  const taskId = e.dataTransfer.getData('taskId')
  const newStatus = COLUMNS.find((c) => c.key === columnKey)!.statuses[0]
  onStatusChange(taskId, newStatus)
}

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault()
  e.currentTarget.classList.add('kanban-column--drag-over')
}

const handleDragLeave = (e: React.DragEvent) => {
  e.currentTarget.classList.remove('kanban-column--drag-over')
}
```

### B4. Kanban CSS

Create `apps/web-vite/src/components/KanbanView.css`:

```css
.kanban-board {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  padding: var(--space-3) 0;
  min-height: 400px;
}

.kanban-column {
  flex: 1;
  min-width: 240px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.kanban-column__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid var(--border);
}

.kanban-column__count {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  background: var(--background-tertiary);
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

.kanban-column__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  min-height: 100px;
  transition: background var(--motion-fast) var(--motion-ease);
}

.kanban-column--drag-over .kanban-column__body {
  background: var(--accent-subtle);
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}

.kanban-card {
  padding: var(--space-3);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
}

.kanban-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.kanban-card:active {
  opacity: 0.7;
}

.kanban-card__header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.kanban-card__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  margin-top: 6px;
}

.kanban-card__title {
  font-size: var(--text-sm);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kanban-card__meta {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
  font-size: var(--text-xs);
}

.kanban-card__priority {
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.kanban-card__priority--today {
  background: var(--error-light);
  color: var(--error-color);
}
.kanban-card__priority--next_3_days {
  background: var(--warning-light);
  color: var(--warning-color);
}
.kanban-card__priority--this_week {
  background: var(--info-light);
  color: var(--info-color);
}

.kanban-card__due {
  color: var(--text-tertiary);
}
```

### B5. Wire Into PlannerPage

In `PlannerPage.tsx`, add the board view option:

```tsx
type ViewMode = 'priority' | 'list' | 'board'

// In the render:
{
  viewMode === 'board' && (
    <KanbanView
      tasks={filteredTasks}
      onTaskClick={selectTask}
      onStatusChange={handleStatusChange}
      getProjectColor={getProjectColor}
    />
  )
}
```

When `viewMode === 'board'`, hide the project sidebar and task detail sidebar (full-width board).

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Priority View Improvement

### C1. Group by Urgency Band

In `PriorityView.tsx` (or if it's inline in PlannerPage), restructure the priority grouping:

```tsx
const urgencyBands = [
  {
    key: 'today',
    label: 'Today',
    color: 'var(--error-color)',
    tasks: tasks.filter((t) => t.urgency === 'today'),
  },
  {
    key: 'this_week',
    label: 'This Week',
    color: 'var(--warning-color)',
    tasks: tasks.filter((t) => t.urgency === 'next_3_days' || t.urgency === 'this_week'),
  },
  {
    key: 'this_month',
    label: 'This Month',
    color: 'var(--info-color)',
    tasks: tasks.filter((t) => t.urgency === 'this_month'),
  },
  {
    key: 'later',
    label: 'Someday',
    color: 'var(--text-tertiary)',
    tasks: tasks.filter((t) => t.urgency === 'later' || !t.urgency),
  },
]
```

### C2. Collapsible Bands

Each band is a collapsible section with task count:

```tsx
{
  urgencyBands.map((band) => (
    <details key={band.key} open={band.key === 'today' || band.key === 'this_week'}>
      <summary className="priority-band__header">
        <span className="priority-band__dot" style={{ background: band.color }} />
        <span className="priority-band__label">{band.label}</span>
        <span className="priority-band__count">{band.tasks.length}</span>
      </summary>
      <div className="priority-band__tasks">
        {band.tasks
          .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
          .map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
      </div>
    </details>
  ))
}
```

```css
.priority-band__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  list-style: none;
  font-size: var(--text-sm);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.priority-band__header::-webkit-details-marker {
  display: none;
}

.priority-band__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
}

.priority-band__count {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-left: auto;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase D — Project Sidebar Cleanup

### D1. Add Progress Bars

In `ProjectList.tsx`, each project should show a progress bar:

```tsx
<div className="project-item__progress">
  <div className="project-item__progress-bar" style={{ width: `${completionPercent}%` }} />
</div>
```

### D2. Domain Grouping

Group projects by domain (Work, Personal, etc.) with collapsible sections:

```tsx
const groupedProjects = useMemo(() => {
  const groups = new Map<string, Project[]>()
  for (const project of projects) {
    const domain = project.domain || 'Other'
    const existing = groups.get(domain) || []
    existing.push(project)
    groups.set(domain, existing)
  }
  return groups
}, [projects])
```

### D3. "All Tasks" Option

At the very top of the sidebar, add an "All Tasks" option:

```tsx
<button
  className={`project-item ${!selectedProject ? 'project-item--selected' : ''}`}
  onClick={() => selectProject(null)}
>
  All Tasks
  <span className="project-item__count">{totalTaskCount}</span>
</button>
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

Create `apps/web-vite/src/components/__tests__/KanbanView.test.tsx`:

1. **Renders 4 columns** — Verify Inbox, Active, In Progress, Done columns
2. **Tasks in correct columns** — Pass tasks with different statuses → verify placement
3. **Drag and drop updates status** — Simulate drag → verify `onStatusChange` called
4. **Card shows priority badge** — Verify priority badge renders for urgent tasks
5. **Card shows due date** — Task due in 3 days shows relative date

---

## Commit

```
feat(planner): simplify tabs, add kanban board, improve priority view

- Remove Training and Habits tabs (dedicated pages exist)
- Add Kanban board view with 4 columns and drag-and-drop
- Priority view groups tasks by urgency band (Today/This Week/This Month/Someday)
- Collapsible urgency bands with task counts
- Project sidebar grouped by domain with progress bars
- "All Tasks" option at top of sidebar

Co-Authored-By: Claude <noreply@anthropic.com>
```
