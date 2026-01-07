# Notes Page Notion-Like Redesign - Detailed Plan

**Date:** 2026-01-07  
**Status:** 📋 Planning  
**Priority:** High

## Overview

Redesign the Notes page to match Notion's design philosophy: a clean, full-width document editor with a sidebar for navigation. The design should emphasize the document content while providing easy access to all notes organized by projects.

## Design Goals

1. **Notion-like Layout**: Full-width document view with minimal chrome
2. **Project-Based Organization**: Sidebar organizes notes by linked projects
3. **Rich Content Support**: All TipTap capabilities (headlines, tables, images, bullets, checklists, scientific notation)
4. **Seamless Editing**: Focus on content creation, not navigation
5. **Visual Hierarchy**: Clear distinction between document and navigation

---

## Current State Analysis

### Current Layout (3-Column)

- **Column 1**: Topic/Section Sidebar (240px)
- **Column 2**: Notes List (320px)
- **Column 3**: Editor (flexible)

### Current Issues

- Too much space dedicated to navigation
- Notes list takes up valuable screen space
- Editor feels cramped
- Topic/Section hierarchy doesn't match project-based workflow
- Not optimized for long-form content creation

---

## Target Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Notes | Search | + New Note                        │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│ Sidebar  │  Full-Width Document Editor                      │
│ (280px)  │  (Notion-style, minimal borders)                │
│          │                                                   │
│ Projects │  - Title (inline, editable)                      │
│ - All    │  - Rich content blocks                           │
│ - Proj 1 │  - Headlines (H1-H6)                             │
│ - Proj 2 │  - Paragraphs                                    │
│          │  - Bullet lists                                  │
│ Notes    │  - Numbered lists                                │
│ - Note 1 │  - Checklists                                    │
│ - Note 2 │  - Tables                                        │
│ - Note 3 │  - Images                                        │
│          │  - Code blocks                                   │
│          │  - Scientific notation (LaTeX)                   │
│          │  - Blockquotes                                   │
│          │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

### Sidebar Structure

**Projects Section:**

- "All Notes" (default, shows all notes)
- Project 1 (shows notes linked to this project)
- Project 2
- ... (all projects with linked notes)

**Notes Section (under selected project):**

- List of notes in selected project
- Shows: Title, preview (first line), last modified date
- Active note highlighted
- Search/filter within project

---

## Component Breakdown

### 1. NotesPage Component Redesign

**File:** `apps/web-vite/src/pages/NotesPage.tsx`

**Changes:**

- Remove 3-column grid layout
- Implement 2-column layout (sidebar + editor)
- Remove TopicSidebar component
- Add ProjectSidebar component
- Remove notes list panel
- Make editor full-width
- Update CSS for Notion-like styling

**State Management:**

- `selectedProjectId`: string | null (null = "All Notes")
- `selectedNoteId`: string | null
- `searchQuery`: string
- Remove: `selectedTopicId`, `selectedSectionId`

**Layout CSS:**

```css
.notes-page {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100vh;
  overflow: hidden;
}
```

---

### 2. ProjectSidebar Component (New)

**File:** `apps/web-vite/src/components/notes/ProjectSidebar.tsx`

**Features:**

- Projects list (from useTodoOperations)
- "All Notes" option at top
- Notes list filtered by selected project
- Search within sidebar
- Note preview (first line of content)
- Last modified date
- Active note highlighting

**Props:**

```typescript
interface ProjectSidebarProps {
  notes: Note[]
  projects: CanonicalProject[]
  selectedProjectId: string | null
  selectedNoteId: string | null
  searchQuery: string
  onProjectSelect: (projectId: string | null) => void
  onNoteSelect: (noteId: string) => void
  onCreateNote: () => void
}
```

**Organization Logic:**

- Group notes by `projectIds` array
- Notes can appear in multiple projects
- "All Notes" shows all notes
- Project sections show only notes linked to that project
- Notes without projects appear in "Unlinked" section

**UI Elements:**

- Project header with note count
- Expandable/collapsible project sections
- Note items with title, preview, date
- Search input at top
- "+ New Note" button

---

### 3. NoteEditor Component Enhancement

**File:** `apps/web-vite/src/components/editor/NoteEditor.tsx`

**Current State:**

- Already uses TipTap
- Supports: headings, lists, tables, images, code, math
- Has project linker, OKR linker, attachments

**Enhancements Needed:**

- Remove project linker from editor (move to sidebar/inline)
- Make editor full-width with Notion-like styling
- Add inline title editing (Notion-style)
- Improve block-level styling
- Add slash commands menu (future enhancement)
- Better empty state

**Notion-Style Features:**

- Inline title (H1 at top, editable)
- Block-level focus states
- Smooth transitions
- Minimal borders
- Focus on content

---

### 4. TipTap Editor Styling Updates

**File:** `apps/web-vite/src/components/editor/TipTapEditor.css`

**Current Capabilities (verify all present):**

- ✅ Headlines (H1-H6)
- ✅ Tables
- ✅ Images
- ✅ Bullet lists
- ✅ Numbered lists
- ✅ Checklists (TaskList extension)
- ✅ Scientific notation (Mathematics extension)
- ✅ Code blocks
- ✅ Blockquotes
- ✅ Highlight

**Styling Updates Needed:**

- Notion-like block spacing
- Better focus states
- Inline title styling
- Table styling improvements
- Image handling (drag & drop, resize)
- Checklist styling
- Math notation display

---

### 5. Inline Title Component (New)

**File:** `apps/web-vite/src/components/notes/NoteTitleEditor.tsx`

**Features:**

- Editable H1 at top of document
- Auto-saves on blur
- Placeholder: "Untitled"
- Notion-style: large, bold, minimal border
- Updates note title in real-time

**Implementation:**

- Use TipTap heading extension
- Or separate input component
- Sync with note.title field

---

### 6. Project Organization Logic

**File:** `apps/web-vite/src/lib/notesOrganization.ts` (New)

**Functions:**

```typescript
// Group notes by project
function groupNotesByProject(
  notes: Note[],
  projects: CanonicalProject[]
): Map<string | null, Note[]>

// Filter notes by project
function filterNotesByProject(notes: Note[], projectId: string | null): Note[]

// Get notes for "All Notes" view
function getAllNotes(notes: Note[]): Note[]

// Get unlinked notes
function getUnlinkedNotes(notes: Note[]): Note[]
```

---

## Implementation Tasks

### Phase 1: Layout & Sidebar (High Priority)

1. **Create ProjectSidebar Component**
   - [ ] Create `ProjectSidebar.tsx`
   - [ ] Implement projects list
   - [ ] Implement notes list with filtering
   - [ ] Add search functionality
   - [ ] Add note preview
   - [ ] Style to match design system

2. **Update NotesPage Layout**
   - [ ] Change from 3-column to 2-column grid
   - [ ] Remove TopicSidebar
   - [ ] Remove notes list panel
   - [ ] Add ProjectSidebar
   - [ ] Make editor full-width
   - [ ] Update state management

3. **Project Organization Logic**
   - [ ] Create `notesOrganization.ts` utility
   - [ ] Implement grouping functions
   - [ ] Handle unlinked notes
   - [ ] Handle multi-project notes

### Phase 2: Editor Enhancements (Medium Priority)

4. **Inline Title Editor**
   - [ ] Create `NoteTitleEditor.tsx`
   - [ ] Integrate with NoteEditor
   - [ ] Auto-save on blur
   - [ ] Style as Notion H1

5. **TipTap Styling Updates**
   - [ ] Update `TipTapEditor.css`
   - [ ] Notion-like block spacing
   - [ ] Better focus states
   - [ ] Improve table styling
   - [ ] Improve image handling
   - [ ] Checklist styling

6. **Editor Full-Width Styling**
   - [ ] Remove borders/chrome
   - [ ] Add max-width constraint (Notion-style)
   - [ ] Center content
   - [ ] Improve padding/spacing

### Phase 3: Content Capabilities (Verify & Enhance) ✅ COMPLETE

7. **Verify All TipTap Extensions**
   - [x] Headlines (H1-H6) ✅
   - [x] Tables ✅
   - [x] Images ✅
   - [x] Bullet lists ✅
   - [x] Numbered lists ✅
   - [x] Checklists ✅
   - [x] Scientific notation (LaTeX) ✅
   - [x] Code blocks ✅
   - [x] Blockquotes ✅

8. **Enhance Missing Features**
   - [x] Image drag & drop ✅
   - [x] Image paste from clipboard ✅
   - [x] Image selection highlighting ✅
   - [x] Table selection and styling improvements ✅
   - [x] Better checklist styling ✅
   - [x] Code block basic styling (syntax highlighting requires Prism.js installation) ✅

### Phase 4: Polish & UX (Low Priority) ✅ COMPLETE

9. **Empty States**
   - [x] Empty sidebar state ✅
   - [x] Empty editor state ✅
   - [x] No notes in project state ✅
   - [x] No search results state ✅

10. **Search Enhancement**
    - [x] Search across all notes ✅
    - [x] Search within project ✅
    - [x] Highlight search results ✅

11. **Keyboard Shortcuts**
    - [x] Cmd/Ctrl + N: New note ✅
    - [x] Cmd/Ctrl + K: Focus search ✅
    - [ ] Cmd/Ctrl + P: Quick note switcher (future - deferred)

---

## Technical Considerations

### Data Flow

1. **Load Projects**: Use `useTodoOperations` hook
2. **Load Notes**: Use `useNoteOperations` hook
3. **Filter Notes**: Client-side filtering by `projectIds`
4. **Update Notes**: Existing `updateProjectLinks` function

### Performance

- **Lazy Loading**: Load notes on project selection
- **Virtual Scrolling**: For large note lists
- **Debounced Search**: Search input debouncing
- **Memoization**: Memoize filtered notes

### State Management

- **Local State**: Selected project, selected note, search query
- **URL State**: Consider adding URL params for deep linking
- **Persistence**: Remember last selected project/note

---

## Design System Compliance

### Colors

- Use design tokens (`var(--foreground)`, etc.)
- Accent color for active states
- Muted colors for previews/dates

### Typography

- H1: 24px / 700 (title)
- Body: 16px / 400 (content)
- Small: 14px / 400 (previews, dates)

### Spacing

- Sidebar: 280px width
- Editor padding: 48px horizontal (Notion-style)
- Max content width: 900px (centered)
- Block spacing: 8px between blocks

### Borders & Shadows

- Minimal borders (1px solid var(--border))
- No shadows on editor
- Subtle hover states

---

## Migration Strategy

### Backward Compatibility

- Keep Topic/Section data (don't delete)
- Notes can have both topics and projects
- Gradually migrate users to project-based organization

### Data Migration

- No data migration needed
- Notes already have `projectIds` array
- Topics/Sections remain for backward compatibility

---

## Success Metrics

1. **Layout**: Full-width editor with 280px sidebar
2. **Organization**: Notes organized by projects in sidebar
3. **Content**: All TipTap capabilities working
4. **Performance**: Smooth scrolling, fast filtering
5. **UX**: Notion-like editing experience

---

## Future Enhancements (Out of Scope)

1. **Slash Commands**: `/` menu for quick block insertion
2. **Drag & Drop**: Reorder blocks
3. **Templates**: Note templates
4. **Collaboration**: Real-time editing
5. **Version History**: Note versioning
6. **Backlinks**: Link between notes
7. **Tags**: Tag-based organization
8. **Full-Text Search**: Advanced search

---

## Files to Create/Modify

### New Files

- `apps/web-vite/src/components/notes/ProjectSidebar.tsx`
- `apps/web-vite/src/components/notes/NoteTitleEditor.tsx`
- `apps/web-vite/src/lib/notesOrganization.ts`

### Modified Files

- `apps/web-vite/src/pages/NotesPage.tsx` (major refactor)
- `apps/web-vite/src/components/editor/NoteEditor.tsx` (enhancements)
- `apps/web-vite/src/components/editor/TipTapEditor.css` (styling)
- `apps/web-vite/src/components/editor/TipTapEditor.tsx` (verify extensions)

### Deprecated (Keep for now)

- `apps/web-vite/src/components/notes/TopicSidebar.tsx` (keep for backward compat)

---

## Testing Checklist

- [ ] Sidebar shows all projects
- [ ] "All Notes" shows all notes
- [ ] Project selection filters notes correctly
- [ ] Note selection opens editor
- [ ] Editor is full-width
- [ ] Inline title editing works
- [ ] All TipTap features work (headlines, tables, images, etc.)
- [ ] Search works in sidebar
- [ ] Note preview shows correctly
- [ ] Last modified date displays
- [ ] Active note highlighting works
- [ ] Create new note works
- [ ] Auto-save works
- [ ] Project linking works
- [ ] Multi-project notes appear in all relevant projects

---

**Next Steps:**

1. Review and approve this plan
2. Start with Phase 1 (Layout & Sidebar)
3. Iterate based on feedback
4. Complete remaining phases
