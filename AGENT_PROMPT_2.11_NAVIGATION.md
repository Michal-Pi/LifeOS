# Agent Prompt — Task 2.11: Navigation — Grouping, Search & Shortcuts

> **Scope:** Group navigation items semantically with visual separators, enhance global search to cover all data types with keyboard navigation, and add a keyboard shortcuts overlay.

---

## 0. Context & References

| Item                   | Path (relative to repo root)                                        |
| ---------------------- | ------------------------------------------------------------------- |
| **Design tokens**      | `apps/web-vite/src/tokens.css`                                      |
| **UI primitives**      | `apps/web-vite/src/components/ui/`                                  |
| **TopNav**             | `apps/web-vite/src/components/TopNav.tsx` (72 lines)                |
| **TopNav test**        | `apps/web-vite/src/components/TopNav.test.tsx`                      |
| **GlobalSearch**       | `apps/web-vite/src/components/GlobalSearch.tsx` (139 lines)         |
| **App (Router)**       | `apps/web-vite/src/App.tsx` — 20+ routes                            |
| **CSS — TopNav**       | `apps/web-vite/src/globals.css` — lines ~251-416                    |
| **CSS — GlobalSearch** | `apps/web-vite/src/globals.css` — search classes within nav section |
| **Hooks**              | `useTodoOperations`, `useMessageMailbox`                            |
| **SegmentedControl**   | `apps/web-vite/src/components/SegmentedControl.tsx`                 |

**Current TopNav layout:** `<header>` with brand logo, `primaryLinks` array (Today, Mailbox, Calendar, People, Planner, Notes, Workflows), search, and `secondaryLinks` + Settings in actions area. Flat list with no grouping.

**Current GlobalSearch:** Searches only Tasks, Projects, and Chapters via `useTodoOperations`. Returns max 10 results. No keyboard navigation. No grouped results. Click outside to close.

---

## Phase A — Navigation Grouping

### A1. Restructure Link Arrays

In `TopNav.tsx`, replace the flat `primaryLinks` and `secondaryLinks` arrays with grouped navigation:

```tsx
interface NavGroup {
  label: string
  links: Array<{ to: string; label: string }>
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Daily',
    links: [
      { to: '/today', label: 'Today' },
      { to: '/calendar', label: 'Calendar' },
    ],
  },
  {
    label: 'Organize',
    links: [
      { to: '/planner', label: 'Planner' },
      { to: '/notes', label: 'Notes' },
      { to: '/people', label: 'People' },
    ],
  },
  {
    label: 'Communicate',
    links: [{ to: '/mailbox', label: 'Mailbox' }],
  },
  {
    label: 'Automate',
    links: [
      { to: '/workflows', label: 'Workflows' },
      { to: '/agents', label: 'Agents' },
    ],
  },
]
```

### A2. Render Grouped Links with Separators

```tsx
<nav className="top-nav__links">
  {NAV_GROUPS.map((group, groupIndex) => (
    <div key={group.label} className="top-nav__group">
      {groupIndex > 0 && <span className="top-nav__separator" />}
      {group.links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
        >
          {link.label}
          {link.to === '/mailbox' && unreadCount > 0 && (
            <span className="top-nav__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </NavLink>
      ))}
    </div>
  ))}
</nav>
```

### A3. Separator CSS

```css
.top-nav__group {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.top-nav__separator {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 var(--space-2);
  flex-shrink: 0;
}
```

### A4. Move Settings to Actions Area

Settings stays in the `top-nav__actions` area (already the case). Remove the separate `secondaryLinks` array since Agents is now in the "Automate" group:

```tsx
<div className="top-nav__actions">
  <NavLink
    to="/settings"
    className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
    aria-label="Settings"
  >
    Settings
  </NavLink>
</div>
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Global Search Enhancement

### B1. Expand Search Scope

In `GlobalSearch.tsx`, add search across more data types. Import additional hooks:

```tsx
import { useContacts } from '@/hooks/useContacts'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'

type SearchResultType = 'task' | 'project' | 'chapter' | 'note' | 'contact' | 'event' | 'workflow'

type SearchResult = {
  type: SearchResultType
  id: string
  title: string
  context?: string
  meta?: string // project name, date, circle label, etc.
}
```

### B2. Multi-Source Search

```tsx
const results = useMemo(() => {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const all: SearchResult[] = []

  // Tasks
  tasks.forEach((t) => {
    if (t.title.toLowerCase().includes(q)) {
      all.push({ type: 'task', id: t.id, title: t.title, meta: getProjectName(t.projectId) })
    }
  })

  // Notes
  notes.forEach((n) => {
    if (n.title?.toLowerCase().includes(q)) {
      all.push({ type: 'note', id: n.noteId, title: n.title })
    }
  })

  // Contacts
  contacts.forEach((c) => {
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim()
    if (name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)) {
      all.push({ type: 'contact', id: c.contactId, title: name, meta: CIRCLE_LABELS[c.circle] })
    }
  })

  // Events
  events.forEach((e) => {
    if (e.summary?.toLowerCase().includes(q)) {
      all.push({ type: 'event', id: e.eventId, title: e.summary, meta: formatDate(e.startMs) })
    }
  })

  // Workflows
  workflows.forEach((w) => {
    if (w.name?.toLowerCase().includes(q)) {
      all.push({ type: 'workflow', id: w.workflowId, title: w.name })
    }
  })

  return all.slice(0, 20)
}, [query, tasks, notes, contacts, events, workflows])
```

### B3. Grouped Results Display

```tsx
const groupedResults = useMemo(() => {
  const groups = new Map<SearchResultType, SearchResult[]>()
  for (const result of results) {
    const existing = groups.get(result.type) || []
    existing.push(result)
    groups.set(result.type, existing)
  }
  return groups
}, [results])

const TYPE_ICONS: Record<SearchResultType, string> = {
  task: 'T',
  project: 'P',
  chapter: 'Ch',
  note: 'N',
  contact: 'C',
  event: 'E',
  workflow: 'W',
}

const TYPE_LABELS: Record<SearchResultType, string> = {
  task: 'Tasks',
  project: 'Projects',
  chapter: 'Chapters',
  note: 'Notes',
  contact: 'Contacts',
  event: 'Events',
  workflow: 'Workflows',
}
```

```tsx
{
  isOpen && results.length > 0 && (
    <div className="search-results">
      {Array.from(groupedResults.entries()).map(([type, items]) => (
        <div key={type} className="search-results__group">
          <div className="search-results__group-header">
            <span className="search-results__group-label">{TYPE_LABELS[type]}</span>
            <span className="search-results__group-count">{items.length}</span>
          </div>
          {items.map((result, i) => (
            <button
              key={result.id}
              className={`search-result ${flatIndex(type, i) === activeIndex ? 'search-result--active' : ''}`}
              onClick={() => handleSelect(result)}
            >
              <span className="search-result__icon">{TYPE_ICONS[result.type]}</span>
              <span className="search-result__title">{result.title}</span>
              {result.meta && <span className="search-result__meta">{result.meta}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
```

### B4. Keyboard Navigation

```tsx
const [activeIndex, setActiveIndex] = useState(-1)
const flatResults = results // Already flat

useEffect(() => {
  setActiveIndex(-1)
}, [query])

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Cmd+K / Ctrl+K to open search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      inputRef.current?.focus()
      setIsOpen(true)
      return
    }

    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setQuery('')
        inputRef.current?.blur()
        break
    }
  }

  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [isOpen, activeIndex, results])
```

### B5. Recent Searches

```tsx
const [recentSearches, setRecentSearches] = useState<string[]>(() => {
  try {
    return JSON.parse(localStorage.getItem('lifeos-recent-searches') || '[]')
  } catch {
    return []
  }
})

const addRecentSearch = (q: string) => {
  const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5)
  setRecentSearches(updated)
  localStorage.setItem('lifeos-recent-searches', JSON.stringify(updated))
}

// Show when open with no query:
{
  isOpen && !query.trim() && recentSearches.length > 0 && (
    <div className="search-results">
      <div className="search-results__group">
        <div className="search-results__group-header">
          <span className="search-results__group-label">Recent</span>
        </div>
        {recentSearches.map((q) => (
          <button
            key={q}
            className="search-result"
            onClick={() => {
              setQuery(q)
              setIsOpen(true)
            }}
          >
            <span className="search-result__icon">R</span>
            <span className="search-result__title">{q}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

### B6. Enhanced Navigation Handler

```tsx
const handleSelect = (result: SearchResult) => {
  setIsOpen(false)
  addRecentSearch(query)
  setQuery('')

  switch (result.type) {
    case 'task':
    case 'project':
    case 'chapter':
      navigate(`/planner?${result.type}Id=${result.id}`)
      break
    case 'note':
      navigate(`/notes?noteId=${result.id}`)
      break
    case 'contact':
      navigate(`/people?contactId=${result.id}`)
      break
    case 'event':
      navigate(`/calendar?eventId=${result.id}`)
      break
    case 'workflow':
      navigate(`/workflows/${result.id}`)
      break
  }
}
```

### B7. Search Results CSS

```css
.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: var(--space-1);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-height: 400px;
  overflow-y: auto;
  z-index: 100;
}

.search-results__group {
  padding: var(--space-1) 0;
}

.search-results__group + .search-results__group {
  border-top: 1px solid var(--border);
}

.search-results__group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-3);
}

.search-results__group-label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
}

.search-results__group-count {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-tertiary);
}

.search-result {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: var(--text-sm);
  transition: background var(--motion-fast) var(--motion-ease);
}

.search-result:hover,
.search-result--active {
  background: var(--background-tertiary);
}

.search-result__icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--accent);
  background: var(--accent-subtle);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.search-result__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  flex-shrink: 0;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Keyboard Shortcuts Overlay

### C1. Create `KeyboardShortcuts` Component

Create `apps/web-vite/src/components/KeyboardShortcuts.tsx`:

```tsx
interface ShortcutGroup {
  label: string
  shortcuts: Array<{ keys: string[]; description: string }>
}

const GLOBAL_SHORTCUTS: ShortcutGroup[] = [
  {
    label: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open search' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['G', 'T'], description: 'Go to Today' },
      { keys: ['G', 'P'], description: 'Go to Planner' },
      { keys: ['G', 'N'], description: 'Go to Notes' },
      { keys: ['G', 'C'], description: 'Go to Calendar' },
      { keys: ['G', 'M'], description: 'Go to Mailbox' },
    ],
  },
  {
    label: 'Planner',
    shortcuts: [
      { keys: ['⌘', 'Shift', 'T'], description: 'New task' },
      { keys: ['V', 'P'], description: 'Priority view' },
      { keys: ['V', 'L'], description: 'List view' },
      { keys: ['V', 'B'], description: 'Board view' },
    ],
  },
  {
    label: 'Notes',
    shortcuts: [
      { keys: ['⌘', 'N'], description: 'New note' },
      { keys: ['⌘', 'Shift', 'F'], description: 'Search notes' },
    ],
  },
  {
    label: 'People',
    shortcuts: [{ keys: ['⌘', 'Shift', 'C'], description: 'Quick add contact' }],
  },
  {
    label: 'Calendar',
    shortcuts: [{ keys: ['⌘', 'Shift', 'E'], description: 'New event' }],
  },
]
```

### C2. Overlay Render

```tsx
interface KeyboardShortcutsProps {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
  if (!isOpen) return null

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal__header">
          <h2>Keyboard Shortcuts</h2>
          <button className="ghost-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="shortcuts-modal__body">
          {GLOBAL_SHORTCUTS.map((group) => (
            <div key={group.label} className="shortcuts-group">
              <h3 className="shortcuts-group__label">{group.label}</h3>
              <div className="shortcuts-group__list">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="shortcut-row">
                    <div className="shortcut-row__keys">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {i < shortcut.keys.length - 1 && <span className="shortcut-plus">+</span>}
                        </span>
                      ))}
                    </div>
                    <span className="shortcut-row__description">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

### C3. Wire "?" Listener

In `App.tsx` or a layout component, add the global "?" listener:

```tsx
const [shortcutsOpen, setShortcutsOpen] = useState(false)

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Don't trigger in inputs/textareas
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement).isContentEditable
    ) {
      return
    }
    if (e.key === '?') {
      e.preventDefault()
      setShortcutsOpen((open) => !open)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])

// Render:
;<KeyboardShortcuts isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
```

### C4. Go-To Navigation Shortcuts

Add a "g then letter" chord shortcut for quick navigation:

```tsx
const [pendingGoTo, setPendingGoTo] = useState(false)

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement).isContentEditable
    ) {
      return
    }

    if (pendingGoTo) {
      setPendingGoTo(false)
      switch (e.key.toLowerCase()) {
        case 't':
          navigate('/today')
          break
        case 'p':
          navigate('/planner')
          break
        case 'n':
          navigate('/notes')
          break
        case 'c':
          navigate('/calendar')
          break
        case 'm':
          navigate('/mailbox')
          break
        case 'w':
          navigate('/workflows')
          break
        case 's':
          navigate('/settings')
          break
      }
      return
    }

    if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
      setPendingGoTo(true)
      // Auto-cancel after 1 second
      setTimeout(() => setPendingGoTo(false), 1000)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [pendingGoTo, navigate])
```

### C5. Shortcuts Overlay CSS

```css
.shortcuts-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn var(--motion-fast) var(--motion-ease);
}

.shortcuts-modal {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: min(640px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
}

.shortcuts-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.shortcuts-modal__header h2 {
  font-size: var(--text-lg);
  font-weight: 600;
}

.shortcuts-modal__body {
  overflow-y: auto;
  padding: var(--space-4);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-5);
}

.shortcuts-group__label {
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: var(--space-2);
}

.shortcuts-group__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.shortcut-row__keys {
  display: flex;
  align-items: center;
  gap: 2px;
}

.shortcut-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 var(--space-1);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  font-weight: 600;
  background: var(--background-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
}

.shortcut-plus {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin: 0 1px;
}

.shortcut-row__description {
  font-size: var(--text-sm);
  color: var(--text-secondary);
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

Update `apps/web-vite/src/components/TopNav.test.tsx`:

1. **Renders nav groups** — Verify 4 groups render (Daily, Organize, Communicate, Automate)
2. **Separators between groups** — Verify 3 separator elements
3. **All links present** — Verify Today, Calendar, Planner, Notes, People, Mailbox, Workflows, Agents links
4. **Settings in actions** — Verify Settings link in actions area

Create `apps/web-vite/src/components/__tests__/GlobalSearch.test.tsx`:

5. **Grouped results** — Search query returns results grouped by type with headers
6. **Keyboard Cmd+K opens search** — Simulate Cmd+K → verify input focused
7. **Arrow key navigation** — Arrow down → verify active index increments
8. **Enter selects result** — Active result + Enter → verify navigation
9. **Escape closes** — Open search, press Escape → verify closed
10. **Recent searches** — After selecting a result, re-open → verify recent shown

Create `apps/web-vite/src/components/__tests__/KeyboardShortcuts.test.tsx`:

11. **Overlay renders when open** — Pass `isOpen=true` → verify modal renders
12. **Shows all groups** — Verify "Global", "Planner", "Notes", "People", "Calendar" groups
13. **Close button works** — Click close → verify `onClose` called
14. **Click overlay closes** — Click backdrop → verify `onClose` called

---

## Commit

```
feat(nav): semantic grouping, enhanced search, keyboard shortcuts

- Group navigation into Daily/Organize/Communicate/Automate with separators
- Move Agents into Automate group alongside Workflows
- Global search expanded to cover Tasks, Notes, Contacts, Events, Workflows
- Search results grouped by type with counts and type icons
- Keyboard navigation: arrow keys, Enter to select, Escape to close
- Cmd+K to open search from anywhere
- Recent searches persisted in localStorage (last 5)
- "?" opens keyboard shortcuts overlay
- Go-To shortcuts: G then T/P/N/C/M/W/S for quick page navigation
- Shortcuts overlay shows per-page shortcut groups in responsive grid

Co-Authored-By: Claude <noreply@anthropic.com>
```
