# Agent Prompt — Task 2.4: People/CRM — From List to Relationship Hub

> **Scope:** Add a compact Dunbar circle visualization above the contact list, enhance the contact detail pane with a visual relationship timeline, and implement a quick-add contact shortcut.

---

## 0. Context & References

| Item                      | Path (relative to repo root)                                                         |
| ------------------------- | ------------------------------------------------------------------------------------ |
| **Design tokens**         | `apps/web-vite/src/tokens.css`                                                       |
| **UI primitives**         | `apps/web-vite/src/components/ui/`                                                   |
| **PeoplePage**            | `apps/web-vite/src/pages/PeoplePage.tsx`                                             |
| **ContactList**           | `apps/web-vite/src/components/contacts/ContactList.tsx`                              |
| **ContactCard**           | `apps/web-vite/src/components/contacts/ContactCard.tsx`                              |
| **ContactDetail**         | `apps/web-vite/src/components/contacts/ContactDetail.tsx`                            |
| **ContactFormModal**      | `apps/web-vite/src/components/contacts/ContactFormModal.tsx`                         |
| **CircleFilter**          | `apps/web-vite/src/components/contacts/CircleFilter.tsx`                             |
| **CircleSuggestionBadge** | `apps/web-vite/src/components/contacts/CircleSuggestionBadge.tsx`                    |
| **InteractionTimeline**   | `apps/web-vite/src/components/contacts/InteractionTimeline.tsx`                      |
| **Hooks**                 | `useContacts.ts`, `useContactDetail.ts`, `useContactDedup.ts`                        |
| **Domain model**          | `packages/agents/src/domain/contacts.ts` — `CIRCLE_LABELS`, `DEFAULT_FOLLOW_UP_DAYS` |
| **CSS — Page**            | `apps/web-vite/src/styles/pages/PeoplePage.css`                                      |
| **CSS — Card**            | `apps/web-vite/src/styles/components/ContactCard.css`                                |
| **CSS — Detail**          | `apps/web-vite/src/styles/components/ContactDetail.css`                              |
| **CSS — Form**            | `apps/web-vite/src/styles/components/ContactFormModal.css`                           |

**Current layout:** Master-detail — 340px sidebar (circle filter + contact list) + flex detail pane.

**Circle model (Dunbar):**

- Circle 0: Core (~5) — partner, family, best friends
- Circle 1: Inner (~15) — close friends, mentors
- Circle 2: Active (~50) — good friends, colleagues
- Circle 3: Extended (~150) — meaningful contacts
- Circle 4: Acquaintance — everyone else

---

## Phase A — Circle Visualization

### A1. Create `CircleVisualization` Component

Create `apps/web-vite/src/components/contacts/CircleVisualization.tsx`:

This replaces the current `CircleFilter` tab button bar with a compact visual representation of the 5 concentric Dunbar circles.

```tsx
interface CircleVisualizationProps {
  contacts: Contact[]
  selectedCircle: DunbarCircle | null // null = "All"
  onSelectCircle: (circle: DunbarCircle | null) => void
}
```

**Visual design:** 5 concentric half-rings (top half only to save vertical space), each ring labeled with circle name and contact count.

Alternative approach (simpler to implement): A horizontal bar with 5 segments, each showing the circle name and count. Each segment is colored and sized proportionally. Clicking a segment filters.

```tsx
<div className="circle-viz">
  <button
    className={`circle-viz__all ${selectedCircle === null ? 'circle-viz__all--active' : ''}`}
    onClick={() => onSelectCircle(null)}
  >
    All ({contacts.length})
  </button>
  <div className="circle-viz__rings">
    {([0, 1, 2, 3, 4] as DunbarCircle[]).map((circle) => {
      const count = contacts.filter((c) => c.circle === circle).length
      return (
        <button
          key={circle}
          className={`circle-viz__ring circle-viz__ring--${circle} ${selectedCircle === circle ? 'circle-viz__ring--active' : ''}`}
          onClick={() => onSelectCircle(circle)}
        >
          <span className="circle-viz__ring-label">{CIRCLE_LABELS[circle]}</span>
          <span className="circle-viz__ring-count">{count}</span>
        </button>
      )
    })}
  </div>
</div>
```

### A2. Circle Visualization CSS

```css
.circle-viz {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.circle-viz__all {
  font-size: var(--text-sm);
  font-weight: 500;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: none;
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
  text-align: center;
}

.circle-viz__all--active {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
}

.circle-viz__rings {
  display: flex;
  gap: var(--space-1);
}

.circle-viz__ring {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-2) var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
}

.circle-viz__ring:hover {
  background: var(--background-tertiary);
}

.circle-viz__ring--active {
  border-color: var(--accent);
  background: var(--accent-subtle);
}

/* Circle-specific colors */
.circle-viz__ring--0 {
  border-left: 3px solid var(--core-neon-violet);
}
.circle-viz__ring--1 {
  border-left: 3px solid var(--core-electric-navy);
}
.circle-viz__ring--2 {
  border-left: 3px solid var(--core-cyber-teal);
}
.circle-viz__ring--3 {
  border-left: 3px solid var(--warning);
}
.circle-viz__ring--4 {
  border-left: 3px solid var(--muted-foreground);
}

.circle-viz__ring-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.circle-viz__ring-count {
  font-size: var(--text-lg);
  font-weight: 700;
  font-family: var(--font-mono);
}
```

### A3. Replace CircleFilter in PeoplePage

In `PeoplePage.tsx`, replace the `<CircleFilter>` component with `<CircleVisualization>`.

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Relationship Timeline Enhancement

### B1. Enhance InteractionTimeline Component

In `InteractionTimeline.tsx`, restructure to show a visual vertical timeline:

```tsx
<div className="interaction-timeline">
  {interactions.map((interaction, i) => (
    <div key={interaction.interactionId} className="timeline-entry">
      <div className="timeline-entry__line">
        <span className={`timeline-entry__dot timeline-entry__dot--${interaction.type}`} />
        {i < interactions.length - 1 && <span className="timeline-entry__connector" />}
      </div>
      <div className="timeline-entry__content">
        <div className="timeline-entry__header">
          <span className="timeline-entry__icon">{getTypeIcon(interaction.type)}</span>
          <span className="timeline-entry__date">{formatRelative(interaction.occurredAtMs)}</span>
        </div>
        <p className="timeline-entry__summary">{interaction.summary}</p>
        {interaction.meetingInsights && interaction.meetingInsights.length > 0 && (
          <ul className="timeline-entry__insights">
            {interaction.meetingInsights.map((insight, j) => (
              <li key={j}>{insight}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  ))}
</div>
```

### B2. Timeline CSS

```css
.interaction-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-entry {
  display: flex;
  gap: var(--space-3);
  min-height: 48px;
}

.timeline-entry__line {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
}

.timeline-entry__dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--accent);
  flex-shrink: 0;
}

.timeline-entry__dot--email {
  background: var(--chart-work);
}
.timeline-entry__dot--meeting {
  background: var(--core-neon-violet);
}
.timeline-entry__dot--call {
  background: var(--success);
}
.timeline-entry__dot--message {
  background: var(--core-cyber-teal);
}
.timeline-entry__dot--note {
  background: var(--warning);
}
.timeline-entry__dot--social {
  background: var(--core-hot-magenta);
}

.timeline-entry__connector {
  width: 2px;
  flex: 1;
  background: var(--border);
}

.timeline-entry__content {
  flex: 1;
  padding-bottom: var(--space-3);
}

.timeline-entry__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.timeline-entry__date {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.timeline-entry__summary {
  font-size: var(--text-sm);
  color: var(--foreground);
}
```

### B3. "Next Follow-Up" Prominent Display

At the top of the `ContactDetail.tsx` component, before the timeline, show the follow-up countdown prominently:

```tsx
{
  contact.nextFollowUpMs && (
    <div
      className={`contact-detail__followup-banner contact-detail__followup-banner--${getFollowUpStatus(contact)}`}
    >
      <span className="contact-detail__followup-label">
        {getFollowUpStatus(contact) === 'overdue'
          ? 'Follow-up overdue'
          : getFollowUpStatus(contact) === 'due'
            ? 'Follow-up due'
            : 'Next follow-up'}
      </span>
      <span className="contact-detail__followup-countdown">
        {formatRelative(contact.nextFollowUpMs)}
      </span>
    </div>
  )
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Quick Add Contact

### C1. Add Keyboard Shortcut

In `PeoplePage.tsx`, add a keyboard listener:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
      e.preventDefault()
      setQuickAddOpen(true)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

### C2. Quick-Add Form

Create a minimal contact creation popover/modal that shows only:

- **Name** (required, auto-focused)
- **Email** (optional)
- **Circle** selector (5 buttons, default Active)
- "Save" + "More details" (opens full ContactFormModal)

This can be rendered as a small modal or as an inline form at the top of the contact list.

### C3. Floating "+" Button

Add a floating action button in the page header:

```tsx
<button
  className="people-page__fab"
  onClick={() => setQuickAddOpen(true)}
  title="Add contact (⌘⇧C)"
>
  +
</button>
```

```css
.people-page__fab {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--accent);
  color: var(--accent-foreground);
  border: none;
  font-size: var(--text-lg);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--motion-ease);
  box-shadow: var(--shadow-md);
}

.people-page__fab:hover {
  background: var(--accent-hover);
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

Create `apps/web-vite/src/components/contacts/__tests__/CircleVisualization.test.tsx`:

1. **Renders all 5 circles** — Verify 5 circle buttons render
2. **Shows contact counts** — Pass contacts with mixed circles → verify counts
3. **Click filters** — Click circle 0 → verify `onSelectCircle(0)` called
4. **"All" shows total** — Verify "All" button shows total count
5. **Active state** — Selected circle has `--active` class

Create `apps/web-vite/src/components/contacts/__tests__/InteractionTimeline.test.tsx`:

6. **Renders timeline entries** — Pass 3 interactions → verify 3 entries render
7. **Type-specific dots** — Email interaction has `--email` dot class
8. **Chronological order** — Verify entries are in order

---

## Commit

```
feat(people): add circle visualization, visual timeline, and quick-add contact

- Replace flat tab filter with compact Dunbar circle visualization
- Color-coded circle segments with contact counts
- Visual vertical timeline for interaction history
- Type-specific dot colors (email, meeting, call, message, note)
- Follow-up countdown banner at top of contact detail
- Quick-add contact via ⌘⇧C shortcut or floating + button
- Minimal form: name + email + circle + "More details" link

Co-Authored-By: Claude <noreply@anthropic.com>
```
