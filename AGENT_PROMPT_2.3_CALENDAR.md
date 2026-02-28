# Agent Prompt — Task 2.3: Calendar — Improved Event Interaction

> **Scope:** Add quick-create popover for empty time slots, enrich the event detail sidebar with contact/task links, and improve the view toggle UX.

---

## 0. Context & References

| Item                       | Path (relative to repo root)                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| **Design tokens**          | `apps/web-vite/src/tokens.css`                                                                      |
| **UI primitives**          | `apps/web-vite/src/components/ui/`                                                                  |
| **CalendarPage**           | `apps/web-vite/src/pages/CalendarPage.tsx` (~550 lines)                                             |
| **CalendarHeader**         | `apps/web-vite/src/components/calendar/CalendarHeader.tsx` (77 lines)                               |
| **CalendarViewsContainer** | `apps/web-vite/src/components/calendar/CalendarViewsContainer.tsx` (342 lines)                      |
| **CalendarSidebar**        | `apps/web-vite/src/components/CalendarSidebar.tsx` (260 lines)                                      |
| **SyncStatusBanner**       | `apps/web-vite/src/components/calendar/SyncStatusBanner.tsx` (158 lines)                            |
| **EventModalsContainer**   | `apps/web-vite/src/components/calendar/EventModalsContainer.tsx` (142 lines)                        |
| **View components**        | `MonthView.tsx`, `WeeklyView.tsx`, `DailyView.tsx`, `AgendaView.tsx` in `components/calendar/`      |
| **Offline store**          | `apps/web-vite/src/calendar/offlineStore.ts`                                                        |
| **Hooks**                  | `useCalendarEvents.ts`, `useEventOperations` (in CalendarPage)                                      |
| **Calendar CSS (globals)** | `apps/web-vite/src/globals.css` — lines 1041-2009 (calendar), 3883-4523 (sync/recurrence/attendees) |
| **SegmentedControl**       | `apps/web-vite/src/components/SegmentedControl.tsx`                                                 |

**Current view toggle:** Plain text buttons with `.view-toggle` class (globals.css lines 1498-1525).

**Current sidebar:** Shows event title, time, description, location, attendees, RSVP buttons, sync status, edit/delete actions.

---

## Phase A — Quick-Create Event Popover

### A1. Create `QuickEventCreate` Component

Create `apps/web-vite/src/components/calendar/QuickEventCreate.tsx`:

```tsx
interface QuickEventCreateProps {
  startTime: Date
  endTime: Date
  position: { top: number; left: number }
  onSave: (data: { title: string; startMs: number; endMs: number }) => void
  onMoreOptions: (data: { title: string; startMs: number; endMs: number }) => void
  onClose: () => void
}
```

**Popover content:**

- Title input (auto-focused)
- Time display: "2:00 PM - 3:00 PM" (read-only, derived from slot)
- "Save" button (primary)
- "More options" link (opens full EventFormModal with pre-filled data)
- Click-outside and Escape to close

```tsx
<div className="quick-event" style={{ top: position.top, left: position.left }}>
  <input
    ref={inputRef}
    className="quick-event__title"
    placeholder="Event title"
    autoFocus
    onKeyDown={(e) => {
      if (e.key === 'Enter') handleSave()
      if (e.key === 'Escape') onClose()
    }}
  />
  <div className="quick-event__time">
    {formatTime(startTime)} — {formatTime(endTime)}
  </div>
  <div className="quick-event__actions">
    <button className="primary-button" onClick={handleSave}>
      Save
    </button>
    <button className="ghost-button" onClick={handleMoreOptions}>
      More options
    </button>
  </div>
</div>
```

### A2. QuickEventCreate CSS

```css
.quick-event {
  position: absolute;
  z-index: 50;
  width: 280px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.quick-event__title {
  width: 100%;
  padding: var(--space-2);
  font-size: var(--text-base);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
}

.quick-event__title:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.quick-event__time {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.quick-event__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
```

### A3. Wire Into DailyView and WeeklyView

In `DailyView.tsx` and `WeeklyView.tsx`, add click handlers on empty time slots:

```tsx
const [quickCreate, setQuickCreate] = useState<{
  startTime: Date
  endTime: Date
  position: { top: number; left: number }
} | null>(null)

// In the time grid, when user clicks an empty slot:
const handleSlotClick = (e: React.MouseEvent, hour: number) => {
  const rect = e.currentTarget.getBoundingClientRect()
  setQuickCreate({
    startTime: new Date(selectedDate.setHours(hour, 0, 0, 0)),
    endTime: new Date(selectedDate.setHours(hour + 1, 0, 0, 0)),
    position: { top: rect.top + window.scrollY, left: rect.left },
  })
}
```

When the user saves from the popover:

1. Call `createEvent()` with the title and time
2. Close the popover
3. Select the new event in the sidebar

When "More options" is clicked:

1. Close the popover
2. Open the full `EventFormModal` with title, start, and end pre-filled via `EventModalsContainer.openCreateModal(prefill)`

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Event Detail Sidebar Enrichment

### B1. Contact Links Section

In `CalendarSidebar.tsx`, after the attendee list, add a "Linked Contacts" section:

```tsx
{
  linkedContacts.length > 0 && (
    <div className="calendar-detail__contacts">
      <p className="section-label">Linked Contacts</p>
      {linkedContacts.map((contact) => (
        <Link
          key={contact.contactId}
          to={`/people?contactId=${contact.contactId}`}
          className="calendar-detail__contact-link"
        >
          <span className="calendar-detail__contact-avatar">
            {getInitials(contact.displayName)}
          </span>
          <span className="calendar-detail__contact-name">{contact.displayName}</span>
          <span className="calendar-detail__contact-circle">{CIRCLE_LABELS[contact.circle]}</span>
        </Link>
      ))}
    </div>
  )
}
```

**Logic:** Match event attendees' email addresses against the user's contacts. Use a lookup from `useContacts` or pass contacts as a prop.

### B2. Related Tasks Section

If any tasks are linked to the selected event (by matching event title to project/task title, or via explicit `linkedEventId`):

```tsx
{
  relatedTasks.length > 0 && (
    <div className="calendar-detail__tasks">
      <p className="section-label">Related Tasks</p>
      {relatedTasks.map((task) => (
        <Link
          key={task.id}
          to={`/planner?taskId=${task.id}`}
          className="calendar-detail__task-link"
        >
          <span className={`calendar-detail__task-status ${task.completed ? 'completed' : ''}`}>
            {task.completed ? '✓' : '○'}
          </span>
          <span>{task.title}</span>
        </Link>
      ))}
    </div>
  )
}
```

### B3. Meeting Prep Button

If the event has attendees who match CRM contacts, show a prominent "Prepare for Meeting" button that opens the existing `MeetingBriefingModal`:

```tsx
{
  hasLinkedContacts && (
    <button
      className="primary-button calendar-detail__prep-btn"
      onClick={() => setShowBriefing(true)}
    >
      Prepare for Meeting
    </button>
  )
}
```

### B4. Sidebar Enrichment CSS

```css
.calendar-detail__contacts,
.calendar-detail__tasks {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.calendar-detail__contact-link,
.calendar-detail__task-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  text-decoration: none;
  color: var(--foreground);
  transition: background var(--motion-fast) var(--motion-ease);
}

.calendar-detail__contact-link:hover,
.calendar-detail__task-link:hover {
  background: var(--background-tertiary);
}

.calendar-detail__contact-avatar {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.calendar-detail__contact-circle {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-left: auto;
}

.calendar-detail__prep-btn {
  width: 100%;
  margin-top: var(--space-3);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — View Toggle Improvement

### C1. Replace Text Buttons with SegmentedControl

In `CalendarHeader.tsx`, replace the current `.view-toggles` div with the existing `<SegmentedControl>` component:

```tsx
<SegmentedControl
  value={viewType}
  options={[
    { value: 'daily', label: 'Day' },
    { value: 'weekly', label: 'Week' },
    { value: 'monthly', label: 'Month' },
    { value: 'agenda', label: 'Agenda' },
  ]}
  onChange={onViewTypeChange}
/>
```

### C2. Persist View Mode

In `CalendarPage.tsx`, persist the view type to `localStorage`:

```tsx
const [viewType, setViewType] = useState<ViewType>(() => {
  return (localStorage.getItem('calendar-view') as ViewType) || 'monthly'
})

const handleViewTypeChange = (type: ViewType) => {
  setViewType(type)
  localStorage.setItem('calendar-view', type)
}
```

### C3. Remove Old View Toggle CSS

The old `.view-toggles` and `.view-toggle` classes in globals.css (lines 1498-1525) can be removed or deprecated since the `SegmentedControl` component has its own styling.

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

Create `apps/web-vite/src/components/calendar/__tests__/QuickEventCreate.test.tsx`:

1. **Renders with title input** — Verify input is auto-focused
2. **Enter key saves** — Type title + Enter → `onSave` called with title and times
3. **Escape closes** — Press Escape → `onClose` called
4. **More options callback** — Click "More options" → `onMoreOptions` called

Create `apps/web-vite/src/components/calendar/__tests__/CalendarSidebar.test.tsx`:

5. **Shows linked contacts** — Pass event with matching attendee emails → verify contact links render
6. **Shows prep button** — Verify "Prepare for Meeting" button when contacts are linked
7. **Hides contacts when none match** — Pass event with no matching emails → section not rendered

---

## Commit

```
feat(calendar): add quick-create popover, sidebar enrichment, and view toggle improvement

- Click empty time slot → quick-create popover (title + time + save)
- Sidebar shows linked CRM contacts with avatars and circle badges
- Sidebar shows related tasks
- "Prepare for Meeting" button when contacts match
- Replace view toggle with SegmentedControl
- Persist view mode to localStorage

Co-Authored-By: Claude <noreply@anthropic.com>
```
