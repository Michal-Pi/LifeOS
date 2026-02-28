# Agent Prompt — Task 3.2: Knowledge Management — Notes Enhancement

> **Scope:** Bi-directional linking with `[[` trigger, daily notes with templates, global quick capture, and note template management. (Semantic search and note versioning are deferred — see bottom.)

---

## 0. Context & References

| Item                 | Path (relative to repo root)                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Design tokens**    | `apps/web-vite/src/tokens.css`                                                                                                |
| **UI primitives**    | `apps/web-vite/src/components/ui/`                                                                                            |
| **NotesPage**        | `apps/web-vite/src/pages/NotesPage.tsx`                                                                                       |
| **NoteGraphPage**    | `apps/web-vite/src/pages/NoteGraphPage.tsx`                                                                                   |
| **TipTapEditor**     | `apps/web-vite/src/components/editor/TipTapEditor.tsx`                                                                        |
| **TipTapEditor CSS** | `apps/web-vite/src/components/editor/TipTapEditor.css`                                                                        |
| **BlockMenu**        | `apps/web-vite/src/components/editor/ux/BlockMenu.tsx`                                                                        |
| **BacklinksPanel**   | `apps/web-vite/src/components/notes/BacklinksPanel.tsx`                                                                       |
| **ProjectSidebar**   | `apps/web-vite/src/components/notes/ProjectSidebar.tsx`                                                                       |
| **Note model**       | `packages/notes/src/domain/models.ts` — `Note` (has `linkedNoteIds`, `backlinkNoteIds`, `mentionedNoteIds`, `paragraphLinks`) |
| **Graph model**      | `packages/notes/src/domain/graphModels.ts` — `NoteGraphNode`, `NoteGraphEdge`, `NoteGraphEdgeType`                            |
| **Note hooks**       | `useNoteOperations`, `useNoteEditor`, `useNoteAITools`, `useNoteGraph`, `useTopics`, `useSections`                            |
| **AI tools**         | `apps/web-vite/src/lib/noteAITools.ts`, `apps/web-vite/src/hooks/useNoteAITools.ts`                                           |
| **Today page**       | `apps/web-vite/src/pages/TodayPage.tsx`                                                                                       |
| **CSS**              | `apps/web-vite/src/styles/components/AIToolsDropdown.css`, `ImportModal.css`                                                  |

**Current state:** Notes already have `linkedNoteIds` and `backlinkNoteIds` arrays in the model, plus a `BacklinksPanel` component. The graph model supports `explicit_link` edge types. However, there's no `[[` trigger in the editor and backlinks don't auto-update on link creation. Daily notes and quick capture don't exist.

---

## Phase A — Bi-directional Linking (`[[` Trigger)

### A1. Create TipTap Extension for Note Links

Create a TipTap extension that listens for `[[` and opens a search popover:

```ts
// apps/web-vite/src/components/editor/extensions/NoteLinkExtension.ts

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const noteLinkPluginKey = new PluginKey('noteLink')

export const NoteLinkExtension = Extension.create({
  name: 'noteLink',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: noteLinkPluginKey,
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view
            const $pos = state.doc.resolve(from)
            const textBefore = $pos.parent.textContent.slice(
              Math.max(0, $pos.parentOffset - 1),
              $pos.parentOffset
            )

            // Detect [[ pattern
            if (text === '[' && textBefore === '[') {
              // Dispatch custom event to open note search popover
              editor.storage.noteLink.openSearch(from - 1) // position of first [
              return false // Let the character be inserted
            }
            return false
          },
        },
      }),
    ]
  },

  addStorage() {
    return {
      openSearch: (_pos: number) => {},
      searchOpen: false,
      searchPosition: 0,
    }
  },
})
```

### A2. Note Search Popover

Create `apps/web-vite/src/components/editor/ux/NoteLinkPopover.tsx`:

```tsx
interface NoteLinkPopoverProps {
  isOpen: boolean
  position: { top: number; left: number }
  query: string
  onSelect: (noteId: string, noteTitle: string) => void
  onClose: () => void
  notes: Array<{ noteId: string; title: string }>
}

export function NoteLinkPopover({
  isOpen,
  position,
  query,
  onSelect,
  onClose,
  notes,
}: NoteLinkPopoverProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered = useMemo(() => {
    if (!query) return notes.slice(0, 8)
    const q = query.toLowerCase()
    return notes.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 8)
  }, [query, notes])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[activeIndex])
            onSelect(filtered[activeIndex].noteId, filtered[activeIndex].title)
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, activeIndex, filtered, onSelect, onClose])

  if (!isOpen || filtered.length === 0) return null

  return (
    <div className="note-link-popover" style={{ top: position.top, left: position.left }}>
      {filtered.map((note, i) => (
        <button
          key={note.noteId}
          className={`note-link-popover__item ${i === activeIndex ? 'note-link-popover__item--active' : ''}`}
          onClick={() => onSelect(note.noteId, note.title)}
        >
          {note.title}
        </button>
      ))}
    </div>
  )
}
```

### A3. Insert Link and Update Backlinks

When a note is selected from the popover:

1. Replace the `[[query` text with a styled link node
2. Update the current note's `linkedNoteIds` array
3. Update the target note's `backlinkNoteIds` array

```ts
const handleNoteSelected = async (targetNoteId: string, targetTitle: string) => {
  // 1. Replace [[query text with a link
  const { from } = editor.storage.noteLink
  editor
    .chain()
    .deleteRange({ from: from, to: editor.state.selection.from })
    .insertContent({
      type: 'text',
      marks: [
        { type: 'link', attrs: { href: `/notes?noteId=${targetNoteId}`, class: 'note-link' } },
      ],
      text: targetTitle,
    })
    .run()

  // 2. Update linkedNoteIds on current note
  await updateNote(currentNoteId, {
    linkedNoteIds: arrayUnion(targetNoteId),
  })

  // 3. Update backlinkNoteIds on target note
  await updateNote(targetNoteId, {
    backlinkNoteIds: arrayUnion(currentNoteId),
  })
}
```

### A4. Enhance BacklinksPanel

The existing `BacklinksPanel` should show the paragraph context around each backlink, not just the note title:

```tsx
{
  backlinks.map((backlink) => (
    <div key={backlink.noteId} className="backlink-entry">
      <a href={`/notes?noteId=${backlink.noteId}`} className="backlink-entry__title">
        {backlink.title}
      </a>
      {backlink.contextSnippet && (
        <p className="backlink-entry__context">...{backlink.contextSnippet}...</p>
      )}
    </div>
  ))
}
```

To extract context, when computing backlinks, find the paragraph containing the link and extract surrounding text (100 chars before and after).

### A5. Note Link CSS

```css
.note-link {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-style: dotted;
  cursor: pointer;
}
.note-link:hover {
  text-decoration-style: solid;
}

.note-link-popover {
  position: absolute;
  z-index: 50;
  width: 280px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.note-link-popover__item {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: background var(--motion-fast) var(--motion-ease);
}
.note-link-popover__item:hover,
.note-link-popover__item--active {
  background: var(--background-tertiary);
}

.backlink-entry {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}
.backlink-entry__title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--accent);
}
.backlink-entry__context {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: var(--space-1);
  line-height: 1.4;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Daily Notes

### B1. Daily Note Auto-Creation

Create a hook `apps/web-vite/src/hooks/useDailyNote.ts`:

```ts
export function useDailyNote() {
  const { notes, createNote } = useNoteOperations()
  const { events } = useCalendarEvents() // today's events

  const todayKey = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const dailyNote = useMemo(
    () =>
      notes.find(
        (n) => n.tags?.includes('daily-note') && n.title === `Daily — ${formatDate(todayKey)}`
      ),
    [notes, todayKey]
  )

  const createDailyNote = async () => {
    if (dailyNote) return dailyNote

    const todayEvents = events.filter((e) => e.occursOn?.includes(todayKey))
    const eventLinks = todayEvents.map((e) => `- ${e.title} (${formatTime(e.startMs)})`).join('\n')

    const template = `## What's on my mind\n\n\n\n## Today's Schedule\n${eventLinks || '- No events scheduled'}\n\n## Quick Capture\n\n`

    const note = await createNote({
      title: `Daily — ${formatDate(todayKey)}`,
      contentHtml: template,
      tags: ['daily-note'],
      topicId: dailyNoteTopicId, // auto-create "Daily Notes" topic if needed
    })
    return note
  }

  return { dailyNote, createDailyNote, todayKey }
}
```

### B2. Today Page Integration

In `TodayPage.tsx`, add a card linking to today's daily note:

```tsx
const { dailyNote, createDailyNote } = useDailyNote()

;<div className="today-card today-card--daily-note">
  <h3>Daily Note</h3>
  {dailyNote ? (
    <a href={`/notes?noteId=${dailyNote.noteId}`} className="daily-note-link">
      Open today's note
    </a>
  ) : (
    <button className="ghost-button" onClick={createDailyNote}>
      Start today's note
    </button>
  )}
</div>
```

### B3. Sidebar Section for Daily Notes

In `ProjectSidebar.tsx`, add a "Daily Notes" section at the top (below Pinned, if that exists from Task 2.6):

```tsx
const dailyNotes = notes
  .filter((n) => n.tags?.includes('daily-note'))
  .sort((a, b) => b.createdAtMs - a.createdAtMs)
  .slice(0, 7) // Show last 7 days

{
  dailyNotes.length > 0 && (
    <div className="sidebar-section sidebar-section--daily">
      <div className="sidebar-section__header">
        <span className="sidebar-section__label">Daily Notes</span>
      </div>
      {dailyNotes.map((note) => (
        <NoteItem key={note.noteId} note={note} />
      ))}
    </div>
  )
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Quick Capture

### C1. Create Global Capture Modal

Create `apps/web-vite/src/components/QuickCapture.tsx`:

```tsx
interface QuickCaptureProps {
  isOpen: boolean
  onClose: () => void
}

export function QuickCapture({ isOpen, onClose }: QuickCaptureProps) {
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [targetNoteId, setTargetNoteId] = useState<string>('inbox') // 'inbox' = default capture note
  const { appendToNote, createNote } = useNoteOperations()

  const handleCapture = async () => {
    const timestamp = new Date().toLocaleString()
    const entry = `\n---\n**${timestamp}**${url ? ` — [Link](${url})` : ''}\n${content}\n${tags ? `Tags: ${tags}` : ''}`

    if (targetNoteId === 'inbox') {
      // Append to "Capture Inbox" note (auto-create if missing)
      await appendToInboxNote(entry)
    } else {
      await appendToNote(targetNoteId, entry)
    }

    setContent('')
    setUrl('')
    setTags('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="quick-capture-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Quick Capture</h3>
        <textarea
          className="quick-capture__content"
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          autoFocus
          rows={3}
        />
        <input
          type="url"
          className="quick-capture__url"
          placeholder="URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          type="text"
          className="quick-capture__tags"
          placeholder="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <div className="quick-capture__actions">
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={handleCapture} disabled={!content.trim()}>
            Capture
          </button>
        </div>
      </div>
    </div>
  )
}
```

### C2. Global Keyboard Shortcut

In `App.tsx` or a layout component:

```tsx
const [captureOpen, setCaptureOpen] = useState(false)

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
      e.preventDefault()
      setCaptureOpen(true)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
;<QuickCapture isOpen={captureOpen} onClose={() => setCaptureOpen(false)} />
```

### C3. Quick Capture CSS

```css
.quick-capture-modal {
  width: min(480px, 90vw);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.quick-capture__content {
  resize: vertical;
  min-height: 80px;
}
.quick-capture__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase D — Note Templates

### D1. Template Model

Add to note domain or create a simple type:

```ts
export interface NoteTemplate {
  templateId: string
  userId: string
  name: string
  titlePattern: string // e.g., "Meeting Notes — {date}"
  contentHtml: string // Template HTML with placeholders
  defaultTags: string[]
  defaultTopicId?: string
  createdAtMs: number
  updatedAtMs: number
}
```

Firestore path: `/users/{userId}/noteTemplates/{templateId}`

### D2. Built-in Templates

Seed a few default templates:

```ts
const BUILTIN_TEMPLATES: Omit<
  NoteTemplate,
  'templateId' | 'userId' | 'createdAtMs' | 'updatedAtMs'
>[] = [
  {
    name: 'Meeting Notes',
    titlePattern: 'Meeting — {date}',
    contentHtml:
      '<h2>Attendees</h2><p></p><h2>Agenda</h2><ul><li></li></ul><h2>Notes</h2><p></p><h2>Action Items</h2><ul><li></li></ul>',
    defaultTags: ['meeting'],
  },
  {
    name: 'Project Brief',
    titlePattern: '{title} — Brief',
    contentHtml:
      '<h2>Objective</h2><p></p><h2>Background</h2><p></p><h2>Requirements</h2><ul><li></li></ul><h2>Timeline</h2><p></p><h2>Success Criteria</h2><ul><li></li></ul>',
    defaultTags: ['project-brief'],
  },
  {
    name: 'Research Note',
    titlePattern: 'Research — {topic}',
    contentHtml:
      '<h2>Question</h2><p></p><h2>Sources</h2><ul><li></li></ul><h2>Key Findings</h2><p></p><h2>Conclusions</h2><p></p>',
    defaultTags: ['research'],
  },
  {
    name: 'Weekly Review',
    titlePattern: 'Weekly Review — {date}',
    contentHtml:
      '<h2>Wins</h2><ul><li></li></ul><h2>Challenges</h2><ul><li></li></ul><h2>Lessons</h2><p></p><h2>Next Week Priorities</h2><ul><li></li></ul>',
    defaultTags: ['weekly-review'],
  },
]
```

### D3. Template Picker on New Note

When the user clicks "+ New Note" in the notes sidebar, show a template picker dropdown:

```tsx
const [showTemplatePicker, setShowTemplatePicker] = useState(false)

;<div className="new-note-actions">
  <button className="primary-button" onClick={() => setShowTemplatePicker(true)}>
    + New Note
  </button>
  {showTemplatePicker && (
    <div className="template-picker">
      <button className="template-picker__item" onClick={() => createBlankNote()}>
        Blank Note
      </button>
      {templates.map((t) => (
        <button
          key={t.templateId}
          className="template-picker__item"
          onClick={() => createFromTemplate(t)}
        >
          {t.name}
        </button>
      ))}
      <button className="template-picker__manage" onClick={() => navigate('/notes/templates')}>
        Manage Templates...
      </button>
    </div>
  )}
</div>
```

### D4. Template CSS

```css
.template-picker {
  position: absolute;
  z-index: 50;
  width: 220px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.template-picker__item {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: var(--text-sm);
}
.template-picker__item:hover {
  background: var(--background-tertiary);
}
.template-picker__manage {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--accent);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Deferred Features

| Feature                   | Reason                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3.2.5 Semantic Search** | Requires an embedding pipeline (generate + store + query vectors). High infrastructure cost for incremental gain over keyword search. Revisit once note corpus is larger.           |
| **3.2.6 Note Versioning** | Firestore already tracks `version` and `syncState`. A full diff-based version history UI is a safety-net feature, not a daily driver. Revisit when users report data loss concerns. |

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

Create `apps/web-vite/src/components/editor/__tests__/NoteLinkExtension.test.tsx`:

1. **`[[` triggers popover** — Type `[[` in editor → verify popover opens
2. **Search filters notes** — Type `[[meeting` → verify filtered list
3. **Keyboard navigation** — Arrow down + Enter → verify note selected
4. **Link inserted** — Select note → verify link text appears in editor
5. **Backlinks updated** — After linking → verify target note's `backlinkNoteIds` includes current note

Create `apps/web-vite/src/hooks/__tests__/useDailyNote.test.ts`:

6. **Creates daily note** — Call `createDailyNote()` → verify note with correct title and `daily-note` tag
7. **Finds existing daily note** — With existing daily note → `dailyNote` is returned
8. **Template includes events** — With calendar events → verify events in template

Create `apps/web-vite/src/components/__tests__/QuickCapture.test.tsx`:

9. **Captures content** — Enter text + capture → verify note appended
10. **Cmd+Shift+N opens** — Simulate keyboard shortcut → verify modal opens

---

## Commit

```
feat(notes): bi-directional linking, daily notes, quick capture, note templates

- [[ trigger in TipTap editor opens note search popover with keyboard navigation
- Selecting a note inserts a styled link and auto-updates backlinks on both notes
- BacklinksPanel shows paragraph context around each link
- Daily notes auto-created with today's schedule, accessible from Today page and sidebar
- Quick Capture modal (Cmd+Shift+N) from any page, appends to Capture Inbox note
- Note templates: Meeting Notes, Project Brief, Research Note, Weekly Review
- Template picker shown on "+ New Note" with manage templates option

Co-Authored-By: Claude <noreply@anthropic.com>
```
