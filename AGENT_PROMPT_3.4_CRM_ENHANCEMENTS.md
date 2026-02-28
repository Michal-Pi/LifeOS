# Agent Prompt — Task 3.4: CRM Enhancements — Pipeline, Follow-ups, Scoring & Tags

> **Scope:** Add a kanban pipeline view for contacts, automated follow-up workflows with AI-generated messages, interaction health scoring with decay, and freeform notes + tags on contacts.
>
> **Deferred:** Family & Personal CRM features (3.4.2) — birthday tracking, gift ideas, and family dashboard are niche features that can be handled with existing contact notes + tags without dedicated infrastructure.

---

## 0. Context & References

| Item                    | Path (relative to repo root)                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Design tokens**       | `apps/web-vite/src/tokens.css`                                                                                                 |
| **UI primitives**       | `apps/web-vite/src/components/ui/`                                                                                             |
| **PeoplePage**          | `apps/web-vite/src/pages/PeoplePage.tsx`                                                                                       |
| **ContactList**         | `apps/web-vite/src/components/contacts/ContactList.tsx`                                                                        |
| **ContactDetail**       | `apps/web-vite/src/components/contacts/ContactDetail.tsx`                                                                      |
| **ContactFormModal**    | `apps/web-vite/src/components/contacts/ContactFormModal.tsx`                                                                   |
| **InteractionTimeline** | `apps/web-vite/src/components/contacts/InteractionTimeline.tsx`                                                                |
| **Contact model**       | `packages/agents/src/domain/contacts.ts` — `Contact`, `Interaction`, `DunbarCircle`, `CIRCLE_LABELS`, `DEFAULT_FOLLOW_UP_DAYS` |
| **SenderPersona**       | `packages/agents/src/domain/contacts.ts` — AI research data on contacts                                                        |
| **Contact repository**  | `packages/agents/src/ports/contactRepository.ts` — `ContactRepository`, `InteractionRepository`                                |
| **Contact hooks**       | `apps/web-vite/src/hooks/useContacts.ts`, `useContactDetail.ts`                                                                |
| **AI tools**            | `functions/src/contacts/contactAITools.ts`                                                                                     |
| **CSS**                 | `apps/web-vite/src/styles/pages/PeoplePage.css`, `ContactCard.css`, `ContactDetail.css`                                        |

**Current state:** Contacts have `circle` (Dunbar 0-4), `followUpCadenceDays`, `nextFollowUpMs`, `lastInteractionMs`, `tags`, and `notes` (string). Interactions are tracked per contact. No pipeline view, no scoring, no automated follow-up creation.

---

## Phase A — Contact Pipeline View

### A1. Pipeline Model

Add to `packages/agents/src/domain/contacts.ts`:

```ts
export type PipelineStage = 'lead' | 'proposal' | 'active_project' | 'completed' | 'follow_up';

export const DEFAULT_PIPELINE_STAGES: Array<{ key: PipelineStage; label: string }> = [
  { key: 'lead', label: 'Lead' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'active_project', label: 'Active Project' },
  { key: 'completed', label: 'Completed' },
  { key: 'follow_up', label: 'Follow Up' },
];

// Add to Contact type:
pipelineStage?: PipelineStage;
pipelineValue?: number; // Optional deal value
```

### A2. Pipeline View Toggle

In `PeoplePage.tsx`, add a view toggle alongside the existing circle visualization:

```tsx
const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')

;<SegmentedControl
  value={viewMode}
  options={[
    { value: 'list', label: 'Contacts' },
    { value: 'pipeline', label: 'Pipeline' },
  ]}
  onChange={setViewMode}
/>
```

### A3. Pipeline Kanban Component

Create `apps/web-vite/src/components/contacts/ContactPipeline.tsx`:

```tsx
interface ContactPipelineProps {
  contacts: Contact[]
  onContactClick: (contact: Contact) => void
  onStageChange: (contactId: string, newStage: PipelineStage) => void
}

export function ContactPipeline({ contacts, onContactClick, onStageChange }: ContactPipelineProps) {
  const stages = DEFAULT_PIPELINE_STAGES

  const handleDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault()
    const contactId = e.dataTransfer.getData('contactId')
    onStageChange(contactId, stage)
    e.currentTarget.classList.remove('pipeline-column--drag-over')
  }

  return (
    <div className="pipeline-board">
      {stages.map((stage) => {
        const stageContacts = contacts.filter((c) => c.pipelineStage === stage.key)
        return (
          <div
            key={stage.key}
            className="pipeline-column"
            onDrop={(e) => handleDrop(e, stage.key)}
            onDragOver={(e) => {
              e.preventDefault()
              e.currentTarget.classList.add('pipeline-column--drag-over')
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('pipeline-column--drag-over')}
          >
            <div className="pipeline-column__header">
              <span>{stage.label}</span>
              <span className="pipeline-column__count">{stageContacts.length}</span>
            </div>
            <div className="pipeline-column__body">
              {stageContacts.map((contact) => (
                <div
                  key={contact.contactId}
                  className="pipeline-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('contactId', contact.contactId)}
                  onClick={() => onContactClick(contact)}
                >
                  <span className="pipeline-card__name">{contact.displayName}</span>
                  {contact.company && (
                    <span className="pipeline-card__company">{contact.company}</span>
                  )}
                  {contact.lastInteractionMs && (
                    <span className="pipeline-card__last-interaction">
                      Last: {formatRelative(contact.lastInteractionMs)}
                    </span>
                  )}
                  {contact.pipelineValue != null && (
                    <span className="pipeline-card__value">
                      ${contact.pipelineValue.toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

### A4. Pipeline CSS

```css
.pipeline-board {
  display: flex;
  gap: var(--space-3);
  overflow-x: auto;
  padding: var(--space-3) 0;
  min-height: 400px;
}
.pipeline-column {
  flex: 1;
  min-width: 200px;
  max-width: 280px;
  display: flex;
  flex-direction: column;
}
.pipeline-column__header {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  border-bottom: 2px solid var(--border);
}
.pipeline-column__count {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.pipeline-column__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  min-height: 100px;
  border-radius: var(--radius-md);
  transition: background var(--motion-fast) var(--motion-ease);
}
.pipeline-column--drag-over .pipeline-column__body {
  background: var(--accent-subtle);
  outline: 2px dashed var(--accent);
}
.pipeline-card {
  padding: var(--space-3);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.pipeline-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.pipeline-card__name {
  font-size: var(--text-sm);
  font-weight: 500;
}
.pipeline-card__company {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.pipeline-card__last-interaction {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.pipeline-card__value {
  font-size: var(--text-sm);
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--success);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Automated Follow-up Workflows

### B1. Follow-up Rules

The `Contact` model already has `followUpCadenceDays` and `nextFollowUpMs`. Extend the follow-up system to auto-create tasks:

Create `functions/src/contacts/followUpScheduler.ts`:

```ts
// Scheduled Cloud Function (runs daily)
export const checkFollowUps = onSchedule('every day 08:00', async () => {
  const now = Date.now()
  // Query all contacts where nextFollowUpMs <= now and not archived
  const overdueContacts = await getOverdueFollowUps(now)

  for (const contact of overdueContacts) {
    // Create a task in the Planner
    await createFollowUpTask(contact)

    // Generate AI follow-up message suggestion
    const suggestion = await generateFollowUpSuggestion(contact)

    // Store the suggestion on the contact
    await updateContact(contact.userId, contact.contactId, {
      followUpSuggestion: suggestion,
      followUpTaskCreatedAtMs: now,
    })
  }
})
```

### B2. Follow-up Configuration UI

In `ContactDetail.tsx`, add a follow-up rules section:

```tsx
<div className="followup-config">
  <h4>Follow-up Rules</h4>
  <div className="followup-config__row">
    <label>Check in every</label>
    <select
      value={contact.followUpCadenceDays || DEFAULT_FOLLOW_UP_DAYS[contact.circle]}
      onChange={(e) => updateFollowUpCadence(parseInt(e.target.value))}
    >
      <option value="7">Weekly (7 days)</option>
      <option value="14">Bi-weekly (14 days)</option>
      <option value="30">Monthly (30 days)</option>
      <option value="90">Quarterly (90 days)</option>
      <option value="0">Never</option>
    </select>
  </div>
  {contact.followUpSuggestion && (
    <div className="followup-suggestion">
      <h5>Suggested Message</h5>
      <p>{contact.followUpSuggestion}</p>
      <button className="ghost-button" onClick={() => copyToClipboard(contact.followUpSuggestion)}>
        Copy
      </button>
    </div>
  )}
</div>
```

### B3. AI Follow-up Suggestion

```ts
async function generateFollowUpSuggestion(contact: Contact): Promise<string> {
  const recentInteractions = await getRecentInteractions(contact.userId, contact.contactId, 3)
  // Prompt: Given the contact info and recent interactions, suggest a brief, natural follow-up message.
  // Context: contact name, circle, company, last interaction summary
  const result = await callAI({
    prompt: `Generate a brief, natural follow-up message for ${contact.displayName}...`,
    context: { recentInteractions, circle: CIRCLE_LABELS[contact.circle] },
  })
  return result
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Interaction Scoring

### C1. Score Algorithm

Create `packages/agents/src/domain/interactionScore.ts`:

```ts
export interface InteractionHealthScore {
  score: number // 0-100
  breakdown: {
    recency: number // 0-40
    frequency: number // 0-35
    diversity: number // 0-25
  }
  trend: 'improving' | 'stable' | 'declining'
}

export function calculateInteractionHealth(
  interactions: Interaction[],
  circle: DunbarCircle,
  nowMs: number = Date.now()
): InteractionHealthScore {
  if (interactions.length === 0)
    return { score: 0, breakdown: { recency: 0, frequency: 0, diversity: 0 }, trend: 'declining' }

  // Recency (0-40): How recent was the last interaction?
  const lastMs = Math.max(...interactions.map((i) => i.occurredAtMs))
  const daysSinceLast = (nowMs - lastMs) / (1000 * 60 * 60 * 24)
  const expectedCadence = DEFAULT_FOLLOW_UP_DAYS[circle] || 30
  const recency = Math.max(0, 40 * (1 - daysSinceLast / (expectedCadence * 2)))

  // Frequency (0-35): How many interactions in the expected period?
  const periodMs = expectedCadence * 2 * 24 * 60 * 60 * 1000
  const recentInteractions = interactions.filter((i) => nowMs - i.occurredAtMs < periodMs)
  const expectedCount = Math.max(1, expectedCadence <= 14 ? 4 : expectedCadence <= 30 ? 2 : 1)
  const frequency = Math.min(35, 35 * (recentInteractions.length / expectedCount))

  // Diversity (0-25): How many different interaction types?
  const types = new Set(recentInteractions.map((i) => i.type))
  const diversity = Math.min(25, types.size * 8)

  const score = Math.round(recency + frequency + diversity)

  // Trend: compare last 30 days vs previous 30 days
  const last30 = interactions.filter(
    (i) => nowMs - i.occurredAtMs < 30 * 24 * 60 * 60 * 1000
  ).length
  const prev30 = interactions.filter((i) => {
    const age = nowMs - i.occurredAtMs
    return age >= 30 * 24 * 60 * 60 * 1000 && age < 60 * 24 * 60 * 60 * 1000
  }).length
  const trend = last30 > prev30 ? 'improving' : last30 < prev30 ? 'declining' : 'stable'

  return { score, breakdown: { recency, frequency, diversity }, trend }
}
```

### C2. Score Display in ContactDetail

```tsx
const healthScore = useMemo(
  () => calculateInteractionHealth(interactions, contact.circle),
  [interactions, contact.circle]
)

;<div className="health-score">
  <div className="health-score__ring" data-score={healthScore.score}>
    <span className="health-score__value">{healthScore.score}</span>
  </div>
  <div className="health-score__details">
    <span className="health-score__label">Interaction Health</span>
    <span className={`health-score__trend health-score__trend--${healthScore.trend}`}>
      {healthScore.trend === 'improving'
        ? 'Improving'
        : healthScore.trend === 'declining'
          ? 'Declining'
          : 'Stable'}
    </span>
  </div>
</div>
```

### C3. Score CSS

```css
.health-score {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
}
.health-score__ring {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  border: 3px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}
.health-score__ring[data-score^='8'],
.health-score__ring[data-score^='9'],
.health-score__ring[data-score='100'] {
  border-color: var(--success);
}
.health-score__ring[data-score^='5'],
.health-score__ring[data-score^='6'],
.health-score__ring[data-score^='7'] {
  border-color: var(--warning);
}
.health-score__ring[data-score^='0'],
.health-score__ring[data-score^='1'],
.health-score__ring[data-score^='2'],
.health-score__ring[data-score^='3'],
.health-score__ring[data-score^='4'] {
  border-color: var(--error-color);
}
.health-score__value {
  font-size: var(--text-lg);
  font-weight: 700;
  font-family: var(--font-mono);
}
.health-score__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.health-score__trend {
  font-size: var(--text-xs);
  font-weight: 500;
}
.health-score__trend--improving {
  color: var(--success);
}
.health-score__trend--declining {
  color: var(--error-color);
}
.health-score__trend--stable {
  color: var(--text-tertiary);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase D — Contact Notes & Tags

### D1. Enhance Contact Notes

The `Contact` model already has a `notes` string field. Upgrade it to timestamped entries:

```ts
// Add to Contact type:
contactNotes?: ContactNote[];

interface ContactNote {
  noteId: string;
  text: string;
  createdAtMs: number;
}
```

### D2. Notes Section in ContactDetail

```tsx
<div className="contact-notes">
  <div className="contact-notes__header">
    <h4>Notes</h4>
  </div>
  <div className="contact-notes__input">
    <textarea
      placeholder="Add a note..."
      value={newNote}
      onChange={(e) => setNewNote(e.target.value)}
      rows={2}
    />
    <button className="ghost-button" onClick={handleAddNote} disabled={!newNote.trim()}>
      Add
    </button>
  </div>
  {(contact.contactNotes || [])
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((note) => (
      <div key={note.noteId} className="contact-note-entry">
        <p>{note.text}</p>
        <span className="contact-note-entry__date">{formatRelative(note.createdAtMs)}</span>
      </div>
    ))}
</div>
```

### D3. Tag Management

The `Contact` model already has a `tags` string array. Add a tag input to `ContactDetail`:

```tsx
<div className="contact-tags">
  <div className="contact-tags__list">
    {(contact.tags || []).map((tag) => (
      <span key={tag} className="contact-tag">
        {tag}
        <button className="contact-tag__remove" onClick={() => removeTag(tag)}>
          ×
        </button>
      </span>
    ))}
  </div>
  <input
    type="text"
    className="contact-tags__input"
    placeholder="Add tag..."
    value={newTag}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && newTag.trim()) {
        addTag(newTag.trim())
        setNewTag('')
      }
    }}
    onChange={(e) => setNewTag(e.target.value)}
  />
</div>
```

### D4. Tag Filtering in ContactList

In `ContactList.tsx`, add tag-based filtering:

```tsx
const [tagFilter, setTagFilter] = useState<string | null>(null)
const allTags = useMemo(() => {
  const tagSet = new Set<string>()
  contacts.forEach((c) => c.tags?.forEach((t) => tagSet.add(t)))
  return Array.from(tagSet).sort()
}, [contacts])

// Filter contacts by tag
const filteredByTag = tagFilter ? contacts.filter((c) => c.tags?.includes(tagFilter)) : contacts
```

### D5. Notes & Tags CSS

```css
.contact-notes__input {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.contact-notes__input textarea {
  flex: 1;
  resize: vertical;
}
.contact-note-entry {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}
.contact-note-entry__date {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.contact-tags {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.contact-tags__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.contact-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 8px;
  background: var(--accent-subtle);
  color: var(--accent);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 500;
}
.contact-tag__remove {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--accent);
  opacity: 0.5;
}
.contact-tag__remove:hover {
  opacity: 1;
}
.contact-tags__input {
  max-width: 200px;
  font-size: var(--text-sm);
}
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

Create `apps/web-vite/src/components/contacts/__tests__/ContactPipeline.test.tsx`:

1. **Renders 5 columns** — Verify all pipeline stages render
2. **Contacts in correct columns** — Pass contacts with stages → verify placement
3. **Drag-and-drop** — Simulate drag → verify `onStageChange` called

Create `packages/agents/src/domain/__tests__/interactionScore.test.ts`:

4. **Score is 0 with no interactions** — Empty array → score = 0
5. **Recent interaction boosts recency** — Interaction today → high recency component
6. **Multiple types boost diversity** — 3 types → higher diversity
7. **Trend detection** — More interactions in last 30 days → 'improving'
8. **Score decays over time** — No interaction for 60 days → low score

Create `apps/web-vite/src/components/contacts/__tests__/ContactNotesAndTags.test.tsx`:

9. **Add note** — Enter text + click Add → verify note appears
10. **Add tag** — Enter tag + press Enter → verify tag chip appears
11. **Remove tag** — Click × on tag → verify removed
12. **Tag filter** — Select tag → verify only tagged contacts shown

---

## Commit

```
feat(people): pipeline view, automated follow-ups, interaction scoring, notes & tags

- Kanban pipeline: Lead → Proposal → Active Project → Completed → Follow Up
- Drag-and-drop contacts between pipeline stages
- Automated follow-up scheduler: daily check for overdue contacts, auto-create tasks
- AI-generated follow-up message suggestions based on recent interactions
- Interaction health score (0-100): recency + frequency + diversity with trend
- Score ring display with color-coded thresholds
- Timestamped contact notes with add/view
- Tag management: add/remove tags, filter contacts by tag

Co-Authored-By: Claude <noreply@anthropic.com>
```
