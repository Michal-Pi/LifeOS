# Agent Prompt — Task 2.6: Notes — Better Organization & Discovery

> **Scope:** Restructure the notes sidebar with collapsible tree hierarchy, add note preview on hover, and add a metadata bar below note titles.

---

## 0. Context & References

| Item                 | Path (relative to repo root)                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Design tokens**    | `apps/web-vite/src/tokens.css`                                                                                             |
| **UI primitives**    | `apps/web-vite/src/components/ui/`                                                                                         |
| **NotesPage**        | `apps/web-vite/src/pages/NotesPage.tsx`                                                                                    |
| **NoteGraphPage**    | `apps/web-vite/src/pages/NoteGraphPage.tsx`                                                                                |
| **ProjectSidebar**   | `apps/web-vite/src/components/notes/ProjectSidebar.tsx`                                                                    |
| **NoteEditor**       | `apps/web-vite/src/components/editor/NoteEditor.tsx`                                                                       |
| **TipTapEditor**     | `apps/web-vite/src/components/editor/TipTapEditor.tsx`                                                                     |
| **TipTapEditor CSS** | `apps/web-vite/src/components/editor/TipTapEditor.css`                                                                     |
| **BacklinksPanel**   | `apps/web-vite/src/components/notes/BacklinksPanel.tsx`                                                                    |
| **NoteTitleEditor**  | `apps/web-vite/src/components/notes/NoteTitleEditor.tsx`                                                                   |
| **AIToolsDropdown**  | `apps/web-vite/src/components/notes/AIToolsDropdown.tsx`                                                                   |
| **ImportModal**      | `apps/web-vite/src/components/notes/ImportModal.tsx`                                                                       |
| **ProjectLinker**    | `apps/web-vite/src/components/notes/ProjectLinker.tsx`                                                                     |
| **Hooks**            | `useNoteOperations`, `useNoteEditor`, `useNoteAITools`, `useNoteGraph`, `useNoteSync`, `useTopics`, `useSections`          |
| **CSS**              | `apps/web-vite/src/styles/components/AIToolsDropdown.css`, `AIToolsPanel.css`, `ImportModal.css`, `ProjectLinkerModal.css` |

**Current layout:** 2-column grid (280px sidebar | 1fr editor).

**Current sidebar structure:** Flat list of topics (projects) with nested sections (chapters) and notes. "Unassigned" at top. Search bar. Show/hide archived toggle.

---

## Phase A — Sidebar Hierarchy Improvements

### A1. Move "Unassigned" to Bottom

In `ProjectSidebar.tsx`, the "Unassigned" section is currently rendered first. Move it to the very bottom of the sidebar, after all topics/projects.

### A2. Add "Pinned" Section at Top

Above the project tree, add a "Pinned" section that shows notes the user has pinned:

```tsx
{
  pinnedNotes.length > 0 && (
    <div className="sidebar-section sidebar-section--pinned">
      <div className="sidebar-section__header">
        <span className="sidebar-section__label">Pinned</span>
        <span className="sidebar-section__count">{pinnedNotes.length}</span>
      </div>
      {pinnedNotes.map((note) => (
        <NoteItem key={note.id} note={note} />
      ))}
    </div>
  )
}
```

**Pinning mechanism:** Add a `pinned: boolean` field to notes (or use localStorage if you want to avoid a schema change). Add a pin/unpin action to the note context menu.

### A3. Collapsible Topic Nodes

Each topic in the sidebar should be a `<details>` element:

```tsx
<details className="sidebar-topic" open={expandedTopics.has(topic.id)}>
  <summary
    className="sidebar-topic__header"
    onClick={(e) => {
      e.preventDefault()
      toggleTopic(topic.id)
    }}
  >
    <span className="sidebar-topic__arrow">▸</span>
    <span className="sidebar-topic__name">{topic.name}</span>
    <span className="sidebar-topic__count">{noteCount}</span>
    <span className="sidebar-topic__edited">{formatRelative(topic.updatedAtMs)}</span>
  </summary>
  <div className="sidebar-topic__children">
    {sections.map((section) => (
      <details className="sidebar-section" open={expandedSections.has(section.id)}>
        <summary className="sidebar-section__header">
          <span className="sidebar-section__name">{section.name}</span>
          <span className="sidebar-section__count">{sectionNoteCount}</span>
        </summary>
        <div className="sidebar-section__notes">
          {notes
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
            .map((note) => (
              <NoteItem />
            ))}
        </div>
      </details>
    ))}
    {/* Direct notes without a section */}
    {directNotes.map((note) => (
      <NoteItem />
    ))}
  </div>
</details>
```

### A4. Sort Notes by Last-Edited

Within each topic/section, notes should be sorted by `updatedAtMs` descending (most recent first).

### A5. Sidebar CSS Updates

```css
.sidebar-topic__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
  list-style: none;
  transition: background var(--motion-fast) var(--motion-ease);
}

.sidebar-topic__header:hover {
  background: var(--background-tertiary);
}

.sidebar-topic__header::-webkit-details-marker {
  display: none;
}

.sidebar-topic__arrow {
  font-size: 10px;
  color: var(--text-tertiary);
  transition: transform var(--motion-fast) var(--motion-ease);
}

details[open] > .sidebar-topic__header .sidebar-topic__arrow {
  transform: rotate(90deg);
}

.sidebar-topic__count {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  margin-left: auto;
}

.sidebar-topic__edited {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.sidebar-topic__children {
  padding-left: var(--space-3);
}

.sidebar-section__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  list-style: none;
}

.sidebar-section__notes {
  padding-left: var(--space-3);
}

.sidebar-section--pinned {
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-2);
  margin-bottom: var(--space-2);
}

.sidebar-section--pinned .sidebar-section__label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Note Preview on Hover

### B1. Add Hover Tooltip

When hovering a note title in the sidebar for 500ms, show a tooltip/popover with:

- First 2-3 lines of content (plain text stripped from HTML)
- Tags (if any)
- Last edited date (relative)

```tsx
const [previewNote, setPreviewNote] = useState<{ note: Note; rect: DOMRect } | null>(null)
const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>()

const handleNoteMouseEnter = (e: React.MouseEvent, note: Note) => {
  const rect = e.currentTarget.getBoundingClientRect()
  hoverTimerRef.current = setTimeout(() => {
    setPreviewNote({ note, rect })
  }, 500)
}

const handleNoteMouseLeave = () => {
  clearTimeout(hoverTimerRef.current)
  setPreviewNote(null)
}
```

### B2. Preview Popover Component

```tsx
{
  previewNote && (
    <div
      className="note-preview"
      style={{
        top: previewNote.rect.top,
        left: previewNote.rect.right + 8,
      }}
    >
      <p className="note-preview__text">{stripHtml(previewNote.note.contentHtml).slice(0, 200)}</p>
      {previewNote.note.tags?.length > 0 && (
        <div className="note-preview__tags">
          {previewNote.note.tags.map((tag) => (
            <span key={tag} className="note-preview__tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="note-preview__date">Edited {formatRelative(previewNote.note.updatedAtMs)}</p>
    </div>
  )
}
```

### B3. Preview CSS

```css
.note-preview {
  position: fixed;
  z-index: 100;
  width: 260px;
  max-height: 160px;
  padding: var(--space-3);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.note-preview__text {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.note-preview__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.note-preview__tag {
  font-size: var(--text-xs);
  padding: 1px 6px;
  background: var(--accent-subtle);
  color: var(--accent);
  border-radius: var(--radius-full);
}

.note-preview__date {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Note Metadata Bar

### C1. Add Metadata Below Title

In `NotesPage.tsx` or `NoteEditor.tsx`, below the title editor and above the TipTap editor, add a compact metadata bar:

```tsx
<div className="note-meta-bar">
  <span className="note-meta-bar__item">{wordCount} words</span>
  <span className="note-meta-bar__item">Edited {formatRelative(note.updatedAtMs)}</span>
  {note.projectIds?.length > 0 && <span className="note-meta-bar__project">{projectName}</span>}
  {note.tags?.map((tag) => (
    <span key={tag} className="note-meta-bar__tag">
      {tag}
    </span>
  ))}
</div>
```

### C2. Word Count Calculation

```tsx
const wordCount = useMemo(() => {
  if (!note?.contentHtml) return 0
  const text = stripHtml(note.contentHtml)
  return text.split(/\s+/).filter(Boolean).length
}, [note?.contentHtml])
```

### C3. Metadata Bar CSS

```css
.note-meta-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-3);
}

.note-meta-bar__item {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.note-meta-bar__project {
  font-size: var(--text-xs);
  padding: 1px 6px;
  background: var(--accent-subtle);
  color: var(--accent);
  border-radius: var(--radius-full);
  font-weight: 500;
}

.note-meta-bar__tag {
  font-size: var(--text-xs);
  padding: 1px 6px;
  background: var(--background-tertiary);
  color: var(--text-secondary);
  border-radius: var(--radius-full);
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

Create `apps/web-vite/src/components/notes/__tests__/ProjectSidebar.test.tsx`:

1. **Pinned section at top** — Pass notes with pinned flag → verify pinned section renders first
2. **Unassigned at bottom** — Verify "Unassigned" section is after project sections
3. **Notes sorted by last-edited** — Within a topic, newest note is first
4. **Collapsible topics** — Click topic header → verify toggle behavior

Create `apps/web-vite/src/components/notes/__tests__/NoteMetaBar.test.tsx`:

5. **Word count** — Pass note with 150 words → verify "150 words" renders
6. **Tags render** — Pass note with 3 tags → verify 3 tag chips
7. **Relative date** — Pass note edited 2 hours ago → verify "2 hours ago"

---

## Commit

```
feat(notes): restructure sidebar hierarchy, add hover preview and metadata bar

- Collapsible topic/section tree with arrow indicators
- Pinned notes section at top of sidebar
- Unassigned notes moved to bottom
- Notes sorted by last-edited within each section
- Hover preview tooltip (content snippet, tags, edit date)
- Note metadata bar below title (word count, edit date, project, tags)

Co-Authored-By: Claude <noreply@anthropic.com>
```
