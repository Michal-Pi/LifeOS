# Agent Prompt — Task 2.10: Prompt Library — Better Browsing

> **Scope:** Add a category filter chip bar with search, truncate prompt card descriptions, and replace the full-page modal editor with a side panel preview.

---

## 0. Context & References

| Item                  | Path (relative to repo root)                                         |
| --------------------- | -------------------------------------------------------------------- |
| **Design tokens**     | `apps/web-vite/src/tokens.css`                                       |
| **UI primitives**     | `apps/web-vite/src/components/ui/`                                   |
| **PromptLibraryPage** | `apps/web-vite/src/pages/PromptLibraryPage.tsx` (247 lines)          |
| **PromptCard**        | `apps/web-vite/src/components/agents/PromptCard.tsx` (119 lines)     |
| **PromptCard CSS**    | `apps/web-vite/src/components/agents/PromptCard.css`                 |
| **PromptEditor**      | `apps/web-vite/src/components/agents/PromptEditor.tsx`               |
| **PromptEditor CSS**  | `apps/web-vite/src/components/agents/PromptEditor.css`               |
| **Hooks**             | `usePromptLibrary`                                                   |
| **SegmentedControl**  | `apps/web-vite/src/components/SegmentedControl.tsx`                  |
| **Domain types**      | `packages/agents` — `PromptTemplate`, `PromptType`, `PromptCategory` |

**Current layout:** Page with header (Agents/Prompts SegmentedControl + "+ New Prompt"), two `<select>` dropdowns for type/category filtering, a `.prompts-grid` of `PromptCard` components, and an Analytics section below. Clicking Edit opens a full-screen modal overlay with `PromptEditor`.

**Current PromptCard:** Shows type icon, title (truncated 35 chars), description (truncated 120 chars), metadata (category, version, usage), tags (max 3), and Edit/Delete buttons.

**Available types:** `all`, `agent`, `tone-of-voice`, `workflow`, `tool`, `synthesis`

**Available categories:** `all`, `project-management`, `content-creation`, `research`, `review`, `coordination`, `general`

---

## Phase A — Category Filter Enhancement

### A1. Replace Select Dropdowns with Filter Chip Bars

In `PromptLibraryPage.tsx`, replace the current `<select>` dropdowns (lines 107-138) with two rows of filter chips:

```tsx
<div className="prompt-filters">
  <div className="prompt-filters__row">
    <span className="prompt-filters__label">Type</span>
    <div className="prompt-filters__chips">
      {PROMPT_TYPES.map((type) => (
        <button
          key={type}
          className={`filter-chip ${typeFilter === type ? 'filter-chip--active' : ''}`}
          onClick={() => setTypeFilter(type)}
        >
          {type === 'all' ? 'All Types' : TYPE_DISPLAY_LABELS[type]}
        </button>
      ))}
    </div>
  </div>
  <div className="prompt-filters__row">
    <span className="prompt-filters__label">Category</span>
    <div className="prompt-filters__chips">
      {PROMPT_CATEGORIES.map((cat) => (
        <button
          key={cat}
          className={`filter-chip ${categoryFilter === cat ? 'filter-chip--active' : ''}`}
          onClick={() => setCategoryFilter(cat)}
        >
          {cat === 'all' ? 'All Categories' : CATEGORY_DISPLAY_LABELS[cat]}
        </button>
      ))}
    </div>
  </div>
</div>
```

Add display label mappings:

```tsx
const TYPE_DISPLAY_LABELS: Record<PromptType, string> = {
  agent: 'Agent',
  tool: 'Tool',
  workflow: 'Workflow',
  synthesis: 'Synthesis',
  'tone-of-voice': 'Tone of Voice',
}

const CATEGORY_DISPLAY_LABELS: Record<PromptCategory, string> = {
  'project-management': 'Project Mgmt',
  'content-creation': 'Content',
  research: 'Research',
  review: 'Review',
  coordination: 'Coordination',
  general: 'General',
}
```

### A2. Add Search Input

Add a text search field above or alongside the filter chips:

```tsx
const [searchQuery, setSearchQuery] = useState('')

// Filter templates by search
const displayedTemplates = useMemo(() => {
  if (!searchQuery.trim()) return templates
  const q = searchQuery.toLowerCase()
  return templates.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
  )
}, [templates, searchQuery])
```

```tsx
<div className="prompt-filters__search">
  <input
    type="text"
    className="prompt-filters__search-input"
    placeholder="Search prompts by name, description, or tag..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />
  <span className="prompt-filters__count">
    {displayedTemplates.length} prompt{displayedTemplates.length === 1 ? '' : 's'}
  </span>
</div>
```

### A3. Filter CSS

```css
.prompt-filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.prompt-filters__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.prompt-filters__label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  min-width: 64px;
}

.prompt-filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.filter-chip {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
}

.filter-chip:hover {
  background: var(--background-tertiary);
  color: var(--foreground);
}

.filter-chip--active {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 500;
}

.prompt-filters__search {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.prompt-filters__search-input {
  flex: 1;
  max-width: 400px;
}

.prompt-filters__count {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Prompt Card Description Truncation

### B1. Update PromptCard Description

In `PromptCard.tsx`, the description is already truncated to 120 chars. Enhance it to use CSS line-clamp for proper 3-line truncation and add a "Show more" expansion:

```tsx
const [expanded, setExpanded] = useState(false)

// In the render:
;<div className="prompt-card__description">
  <p className={expanded ? '' : 'prompt-card__description--clamped'}>{template.description}</p>
  {template.description.length > 100 && (
    <button
      className="prompt-card__expand"
      onClick={(e) => {
        e.stopPropagation()
        setExpanded(!expanded)
      }}
    >
      {expanded ? 'Show less' : 'Show more'}
    </button>
  )}
</div>
```

### B2. Description CSS

```css
.prompt-card__description--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.prompt-card__expand {
  background: none;
  border: none;
  padding: 0;
  font-size: var(--text-xs);
  color: var(--accent);
  cursor: pointer;
  margin-top: var(--space-1);
}

.prompt-card__expand:hover {
  text-decoration: underline;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Side Panel Preview

### C1. Replace Full-Screen Modal with Side Panel

In `PromptLibraryPage.tsx`, instead of opening the PromptEditor in a full `modal-overlay`, render it as a side panel:

```tsx
<div className={`prompt-library-layout ${editorState ? 'prompt-library-layout--panel-open' : ''}`}>
  <div className="prompt-library-main">{/* Existing filters, grid, analytics content */}</div>

  {editorState && user?.uid && (
    <aside className="prompt-preview-panel">
      <div className="prompt-preview-panel__header">
        <h3>{editorState.mode === 'edit' ? 'Edit Prompt' : 'New Prompt'}</h3>
        <button
          className="ghost-button"
          onClick={() => setEditorState(null)}
          aria-label="Close panel"
        >
          ×
        </button>
      </div>
      <div className="prompt-preview-panel__body">
        <PromptEditor
          userId={user.uid}
          mode={editorState.mode}
          templateId={editorState.mode === 'edit' ? editorState.template.templateId : undefined}
          initialTemplate={editorState.template}
          onClose={() => setEditorState(null)}
          onSaved={() => {
            void loadTemplates()
            void getUsageStats().then(setUsageStats)
          }}
          onDeleted={() => {
            void loadTemplates()
            void getUsageStats().then(setUsageStats)
          }}
        />
      </div>
    </aside>
  )}
</div>
```

### C2. Add "Use in Workflow" Button

When viewing a prompt in the side panel (edit mode), add a button that navigates to the workflows page:

```tsx
{
  editorState.mode === 'edit' && (
    <div className="prompt-preview-panel__actions">
      <button
        className="primary-button"
        onClick={() => {
          navigate(`/workflows?promptId=${editorState.template.templateId}`)
        }}
      >
        Use in Workflow
      </button>
    </div>
  )
}
```

### C3. Click Card to Preview

Change the PromptCard click behavior: clicking the card body opens the side panel in a read-only preview, while Edit/Delete buttons remain:

```tsx
<PromptCard
  key={template.templateId}
  template={template}
  onClick={(template) => setEditorState({ mode: 'edit', template })}
  onEdit={(template) => setEditorState({ mode: 'edit', template })}
  onDelete={...}
/>
```

In `PromptCard.tsx`, add an `onClick` prop to the card wrapper:

```tsx
interface PromptCardProps {
  template: PromptTemplate;
  onClick?: (template: PromptTemplate) => void;
  onEdit: (template: PromptTemplate) => void;
  onDelete: (template: PromptTemplate) => void;
}

// In the render:
<article className="prompt-card" onClick={() => onClick?.(template)}>
```

### C4. Side Panel CSS

```css
.prompt-library-layout {
  display: flex;
  gap: var(--space-5);
  transition: all var(--motion-normal) var(--motion-ease);
}

.prompt-library-main {
  flex: 1;
  min-width: 0;
}

.prompt-preview-panel {
  width: 420px;
  flex-shrink: 0;
  position: sticky;
  top: calc(var(--nav-height) + var(--space-4));
  height: calc(100vh - var(--nav-height) - var(--space-8));
  overflow-y: auto;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
}

.prompt-preview-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.prompt-preview-panel__header h3 {
  font-size: var(--text-lg);
  font-weight: 600;
}

.prompt-preview-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.prompt-preview-panel__actions {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
}

/* When panel is open, shrink grid to fit */
.prompt-library-layout--panel-open .prompts-grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

/* Mobile: panel becomes full overlay */
@media (max-width: 768px) {
  .prompt-preview-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    z-index: 50;
    border-radius: 0;
  }
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

Create `apps/web-vite/src/pages/__tests__/PromptLibraryPage.test.tsx`:

1. **Filter chips render** — Verify all type chips and category chips render
2. **Active filter chip** — Click "Research" category → verify `filter-chip--active` class applied
3. **Search filters prompts** — Type query → verify filtered results
4. **Card description truncation** — Prompt with long description shows 3 lines + "Show more"
5. **Show more expands** — Click "Show more" → full description visible
6. **Side panel opens on card click** — Click a PromptCard → verify side panel renders
7. **Side panel close** — Click close button → panel disappears
8. **Use in Workflow button** — In edit mode, verify "Use in Workflow" button renders

---

## Commit

```
feat(prompts): filter chips, search, card truncation, side panel preview

- Replace select dropdowns with filter chip bars for type and category
- Add text search across prompt name, description, and tags
- Card descriptions use 3-line CSS clamp with "Show more" expansion
- Replace full-screen modal with sticky side panel for prompt preview/edit
- "Use in Workflow" button navigates to workflows with prompt context
- Click card body to open preview, Edit/Delete buttons preserved
- Mobile: side panel becomes full overlay

Co-Authored-By: Claude <noreply@anthropic.com>
```
