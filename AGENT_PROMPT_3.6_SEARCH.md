# Agent Prompt — Task 3.6: Search & Retrieval — Universal Filters & Cross-Reference

> **Scope:** Extend the global search (enhanced in Task 2.11) with advanced filter chips, date/project/tag narrowing, and add a cross-reference discovery panel that surfaces related items when viewing any entity.
>
> **Deferred:** Saved Searches / Smart Filters (3.6.2) — a power-user optimization that adds complexity without proportional value at this stage. Users can re-run searches easily.

---

## 0. Context & References

| Item                     | Path (relative to repo root)                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Design tokens**        | `apps/web-vite/src/tokens.css`                                                                                             |
| **UI primitives**        | `apps/web-vite/src/components/ui/`                                                                                         |
| **GlobalSearch**         | `apps/web-vite/src/components/GlobalSearch.tsx` — expanded in Task 2.11 to cover tasks, notes, contacts, events, workflows |
| **TopNav**               | `apps/web-vite/src/components/TopNav.tsx`                                                                                  |
| **Note model**           | `packages/notes/src/domain/models.ts` — `Note` with `tags`, `projectIds`, `linkedNoteIds`                                  |
| **Contact model**        | `packages/agents/src/domain/contacts.ts` — `Contact` with `circle`, `tags`                                                 |
| **Task model**           | Via `useTodoOperations` — `CanonicalTask` with `projectId`, `status`, `dueDate`                                            |
| **Calendar event model** | `packages/calendar/src/domain/providers/google/googleCalendarEvent.ts`                                                     |
| **Workflow model**       | `packages/agents/src/domain/models.ts` — `Workflow`                                                                        |
| **Hooks**                | `useTodoOperations`, `useContacts`, `useNoteOperations`, `useCalendarEvents`, `useWorkflowOperations`                      |
| **CSS**                  | Search styles in `apps/web-vite/src/globals.css`                                                                           |

**Prerequisite:** Task 2.11 should be completed first. It expands `GlobalSearch` to search across all types with grouped results and keyboard navigation. This task adds filtering and cross-referencing on top.

---

## Phase A — Universal Search with Advanced Filters

### A1. Filter State

In `GlobalSearch.tsx`, add filter state alongside the existing search:

```tsx
interface SearchFilters {
  types: SearchResultType[] // empty = all
  dateRange: { from?: string; to?: string } | null
  projectId: string | null
  tags: string[]
}

const [filters, setFilters] = useState<SearchFilters>({
  types: [],
  dateRange: null,
  projectId: null,
  tags: [],
})
const [showFilters, setShowFilters] = useState(false)
```

### A2. Filter Panel UI

Below the search input, show a collapsible filter panel:

```tsx
{
  showFilters && (
    <div className="search-filters">
      {/* Type filter chips */}
      <div className="search-filters__row">
        <span className="search-filters__label">Type</span>
        <div className="search-filters__chips">
          {ALL_SEARCH_TYPES.map((type) => (
            <button
              key={type}
              className={`filter-chip ${filters.types.includes(type) ? 'filter-chip--active' : ''}`}
              onClick={() => toggleTypeFilter(type)}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Date range */}
      <div className="search-filters__row">
        <span className="search-filters__label">Date</span>
        <div className="search-filters__date-range">
          <input
            type="date"
            value={filters.dateRange?.from || ''}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            value={filters.dateRange?.to || ''}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {/* Project filter */}
      <div className="search-filters__row">
        <span className="search-filters__label">Project</span>
        <select
          value={filters.projectId || ''}
          onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value || null }))}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Tag filter */}
      <div className="search-filters__row">
        <span className="search-filters__label">Tags</span>
        <input
          type="text"
          placeholder="Filter by tag..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
              addTagFilter((e.target as HTMLInputElement).value.trim())
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
        <div className="search-filters__active-tags">
          {filters.tags.map((tag) => (
            <span key={tag} className="filter-tag">
              {tag}
              <button onClick={() => removeTagFilter(tag)}>×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Active filter count + clear */}
      {hasActiveFilters && (
        <button
          className="search-filters__clear"
          onClick={() => setFilters({ types: [], dateRange: null, projectId: null, tags: [] })}
        >
          Clear all filters
        </button>
      )}
    </div>
  )
}
```

### A3. Apply Filters to Results

Extend the search `useMemo` to apply filters:

```tsx
const filteredResults = useMemo(() => {
  let results = allResults

  // Type filter
  if (filters.types.length > 0) {
    results = results.filter((r) => filters.types.includes(r.type))
  }

  // Date range filter
  if (filters.dateRange?.from || filters.dateRange?.to) {
    const fromMs = filters.dateRange.from ? new Date(filters.dateRange.from).getTime() : 0
    const toMs = filters.dateRange.to
      ? new Date(filters.dateRange.to).getTime() + 86400000
      : Infinity
    results = results.filter((r) => {
      const itemMs = getItemTimestamp(r)
      return itemMs >= fromMs && itemMs <= toMs
    })
  }

  // Project filter
  if (filters.projectId) {
    results = results.filter((r) => getItemProjectId(r) === filters.projectId)
  }

  // Tag filter
  if (filters.tags.length > 0) {
    results = results.filter((r) => {
      const itemTags = getItemTags(r)
      return filters.tags.some((tag) => itemTags.includes(tag))
    })
  }

  return results
}, [allResults, filters])
```

### A4. Filter Toggle Button

Add a filter toggle next to the search input:

```tsx
<button
  className={`search-filter-toggle ${showFilters ? 'search-filter-toggle--active' : ''} ${hasActiveFilters ? 'search-filter-toggle--has-filters' : ''}`}
  onClick={() => setShowFilters(!showFilters)}
  aria-label="Toggle filters"
>
  Filters {hasActiveFilters && `(${activeFilterCount})`}
</button>
```

### A5. Filter CSS

```css
.search-filters {
  padding: var(--space-3);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.search-filters__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.search-filters__label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-tertiary);
  min-width: 52px;
}
.search-filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.search-filters__date-range {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.search-filters__date-range input {
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
}
.search-filters__date-range span {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.search-filters__active-tags {
  display: flex;
  gap: var(--space-1);
}
.filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  background: var(--accent-subtle);
  color: var(--accent);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
}
.filter-tag button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--accent);
}
.search-filters__clear {
  align-self: flex-end;
  font-size: var(--text-xs);
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}
.search-filter-toggle {
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
}
.search-filter-toggle--active {
  border-color: var(--accent);
  color: var(--accent);
}
.search-filter-toggle--has-filters {
  background: var(--accent-subtle);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Cross-Reference Discovery Panel

### B1. Create `RelatedItems` Component

Create `apps/web-vite/src/components/RelatedItems.tsx`:

This component takes an item (note, task, event, or contact) and discovers related items across domains.

```tsx
interface RelatedItemsProps {
  itemType: 'note' | 'task' | 'event' | 'contact'
  itemId: string
  projectIds?: string[]
  tags?: string[]
  linkedNoteIds?: string[]
  contactIds?: string[]
}

interface RelatedItem {
  type: 'note' | 'task' | 'event' | 'contact' | 'workflow'
  id: string
  title: string
  reason: string // "Same project", "Shared tag: #strategy", "Linked note"
}

export function RelatedItems({
  itemType,
  itemId,
  projectIds,
  tags,
  linkedNoteIds,
  contactIds,
}: RelatedItemsProps) {
  const related = useRelatedItems({ itemType, itemId, projectIds, tags, linkedNoteIds, contactIds })

  if (related.length === 0) return null

  // Group by type
  const grouped = groupBy(related, 'type')

  return (
    <aside className="related-panel">
      <h4 className="related-panel__title">Related</h4>
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="related-panel__group">
          <span className="related-panel__group-label">
            {TYPE_LABELS[type as RelatedItem['type']]}
          </span>
          {(items as RelatedItem[]).map((item) => (
            <a key={item.id} href={getItemUrl(item)} className="related-item">
              <span className="related-item__title">{item.title}</span>
              <span className="related-item__reason">{item.reason}</span>
            </a>
          ))}
        </div>
      ))}
    </aside>
  )
}
```

### B2. Discovery Logic Hook

Create `apps/web-vite/src/hooks/useRelatedItems.ts`:

```tsx
export function useRelatedItems(params: {
  itemType: string
  itemId: string
  projectIds?: string[]
  tags?: string[]
  linkedNoteIds?: string[]
  contactIds?: string[]
}): RelatedItem[] {
  const { tasks } = useTodoOperations({ userId })
  const { notes } = useNoteOperations()
  const { contacts } = useContacts()
  const { events } = useCalendarEvents()

  return useMemo(() => {
    const items: RelatedItem[] = []

    // 1. Same project
    if (params.projectIds?.length) {
      tasks
        .filter((t) => t.id !== params.itemId && params.projectIds!.includes(t.projectId!))
        .slice(0, 5)
        .forEach((t) =>
          items.push({ type: 'task', id: t.id, title: t.title, reason: 'Same project' })
        )

      notes
        .filter(
          (n) =>
            n.noteId !== params.itemId && n.projectIds?.some((p) => params.projectIds!.includes(p))
        )
        .slice(0, 5)
        .forEach((n) =>
          items.push({ type: 'note', id: n.noteId, title: n.title, reason: 'Same project' })
        )
    }

    // 2. Shared tags
    if (params.tags?.length) {
      notes
        .filter((n) => n.noteId !== params.itemId && n.tags?.some((t) => params.tags!.includes(t)))
        .slice(0, 3)
        .forEach((n) => {
          const sharedTag = n.tags!.find((t) => params.tags!.includes(t))
          items.push({
            type: 'note',
            id: n.noteId,
            title: n.title,
            reason: `Shared tag: ${sharedTag}`,
          })
        })

      contacts
        .filter(
          (c) => c.contactId !== params.itemId && c.tags?.some((t) => params.tags!.includes(t))
        )
        .slice(0, 3)
        .forEach((c) =>
          items.push({
            type: 'contact',
            id: c.contactId,
            title: c.displayName,
            reason: `Shared tag`,
          })
        )
    }

    // 3. Explicit links (for notes)
    if (params.linkedNoteIds?.length) {
      params.linkedNoteIds.forEach((linkedId) => {
        const linkedNote = notes.find((n) => n.noteId === linkedId)
        if (linkedNote)
          items.push({ type: 'note', id: linkedId, title: linkedNote.title, reason: 'Linked note' })
      })
    }

    // 4. Linked contacts (for events)
    if (params.contactIds?.length) {
      params.contactIds.forEach((cId) => {
        const contact = contacts.find((c) => c.contactId === cId)
        if (contact)
          items.push({ type: 'contact', id: cId, title: contact.displayName, reason: 'Attendee' })
      })
    }

    // Deduplicate by type+id
    const seen = new Set<string>()
    return items.filter((item) => {
      const key = `${item.type}:${item.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [params, tasks, notes, contacts, events])
}
```

### B3. Integrate into Pages

Add the `RelatedItems` panel to existing detail views:

**NotesPage** — below the editor or in a sidebar:

```tsx
{
  activeNote && (
    <RelatedItems
      itemType="note"
      itemId={activeNote.noteId}
      projectIds={activeNote.projectIds}
      tags={activeNote.tags}
      linkedNoteIds={activeNote.linkedNoteIds}
    />
  )
}
```

**ContactDetail** — in the overview tab:

```tsx
<RelatedItems itemType="contact" itemId={contact.contactId} tags={contact.tags} />
```

**TaskDetailSidebar** — when viewing a task:

```tsx
<RelatedItems
  itemType="task"
  itemId={task.id}
  projectIds={task.projectId ? [task.projectId] : []}
  tags={task.tags}
/>
```

### B4. Related Panel CSS

```css
.related-panel {
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--card);
}
.related-panel__title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: var(--space-2);
}
.related-panel__group {
  margin-bottom: var(--space-2);
}
.related-panel__group-label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  display: block;
  margin-bottom: var(--space-1);
}
.related-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  text-decoration: none;
  transition: background var(--motion-fast) var(--motion-ease);
}
.related-item:hover {
  background: var(--background-tertiary);
}
.related-item__title {
  font-size: var(--text-sm);
  color: var(--foreground);
}
.related-item__reason {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
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

Create `apps/web-vite/src/components/__tests__/GlobalSearchFilters.test.tsx`:

1. **Filter panel toggles** — Click "Filters" → verify panel appears
2. **Type filter narrows results** — Select "Notes" → only note results shown
3. **Date range filter** — Set date range → only items within range shown
4. **Tag filter** — Add tag → only tagged items shown
5. **Clear filters** — Click "Clear all" → all filters reset

Create `apps/web-vite/src/hooks/__tests__/useRelatedItems.test.ts`:

6. **Same project** — Note with projectId X → related tasks in project X found
7. **Shared tags** — Note with tag "strategy" → other notes with "strategy" found
8. **Linked notes** — Note with linkedNoteIds → those notes appear as related
9. **Deduplication** — Same item found via project + tag → appears once
10. **Empty when no connections** — Isolated item → empty array

---

## Commit

```
feat(search): universal search filters, cross-reference discovery panel

- Search filter panel: type chips, date range, project, tag narrowing
- Active filter count badge on toggle button
- Clear all filters button
- Cross-reference discovery: RelatedItems component surfaces connections
- Discovery by: same project, shared tags, explicit links, attendee links
- Integrated into Notes, Contact Detail, and Task Detail views
- Grouped related items by type with connection reasons

Co-Authored-By: Claude <noreply@anthropic.com>
```
