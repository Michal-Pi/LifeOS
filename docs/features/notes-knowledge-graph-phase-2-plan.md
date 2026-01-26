# Knowledge Graph Phase 2: Remaining Considerations

## Overview

This plan addresses the remaining considerations from the initial knowledge graph implementation:

1. Note link autocomplete UI
2. Graph export UI
3. Performance optimization for link extraction

## Phase 2.1: Note Link Autocomplete UI

### Goal

Implement an autocomplete dropdown that appears when users type `[[` in the editor, allowing them to search and select notes to link.

### Requirements

#### 2.1.1: Create NoteLinkAutocomplete Component

**File**: `apps/web-vite/src/components/editor/ux/NoteLinkAutocomplete.tsx`

**Features**:

- Dropdown menu similar to `CommandMenu` pattern
- Search input with real-time filtering
- List of matching notes (title, project, topic)
- Keyboard navigation (Arrow Up/Down, Enter, Escape)
- Click to select
- Visual feedback for selected item
- Auto-positioning relative to cursor

**Props**:

```typescript
export interface NoteLinkAutocompleteProps {
  editor: Editor
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
  query: string
  availableNotes: Note[]
  onSelectNote: (noteId: string, noteTitle: string) => void
}
```

**Implementation Details**:

- Filter notes by title (case-insensitive, partial match)
- Show note title, project name (if any), topic name (if any)
- Limit results to top 10 matches
- Highlight matching text in results
- Insert `[[Note Title]]` or convert selected text to `[[Note Title]]` when selected
- Convert to `note://` link after selection

#### 2.1.2: Integrate Autocomplete into TipTapEditor

**File**: `apps/web-vite/src/components/editor/TipTapEditor.tsx`

**Changes**:

- Add state for autocomplete menu (`noteLinkAutocompleteState`)
- Detect `[[` typing in `handleKeyDown`
- Track cursor position for menu placement
- Update query as user types after `[[`
- Handle keyboard events (Arrow keys, Enter, Escape)
- Close autocomplete when note is selected or cancelled
- Replace `[[query` with `[[Note Title]]` on selection
- Convert wiki-style link to `note://` link after selection

**Key Logic**:

```typescript
// Detect [[ typing
if (event.key === '[' && previousChar === '[') {
  // Open autocomplete
}

// Update query while typing
if (noteLinkAutocompleteState?.isOpen) {
  // Update query, filter notes
}

// On selection
onSelectNote={(noteId, noteTitle) => {
  // Replace [[query with [[Note Title]]
  // Convert to note:// link
}}
```

#### 2.1.3: Enhance NoteLink Extension

**File**: `apps/web-vite/src/components/editor/extensions/NoteLink.ts`

**Changes**:

- Add command to convert wiki-style `[[Note Title]]` to `note://` link
- Parse wiki-style links and convert them on blur or Enter
- Ensure wiki links are converted to proper note links

**New Command**:

```typescript
convertWikiLinkToNoteLink: (noteId: string, noteTitle: string) => ReturnType
```

#### 2.1.4: Add CSS Styling

**File**: `apps/web-vite/src/components/editor/ux/NoteLinkAutocomplete.css`

**Styles**:

- Dropdown container (similar to CommandMenu)
- Search input styling
- Note item styling (hover, selected states)
- Project/topic metadata styling
- Highlight matching text
- Responsive positioning

### Acceptance Criteria

- [ ] Typing `[[` opens autocomplete dropdown
- [ ] Typing after `[[` filters notes in real-time
- [ ] Arrow keys navigate through results
- [ ] Enter selects highlighted note
- [ ] Escape closes autocomplete
- [ ] Clicking a note selects it
- [ ] Selected text is replaced with `[[Note Title]]`
- [ ] Wiki link is converted to `note://` link
- [ ] Autocomplete closes after selection
- [ ] Menu positions correctly relative to cursor
- [ ] Works with existing keyboard shortcuts

---

## Phase 2.2: Graph Export UI

### Goal

Add export functionality to the graph visualization page, allowing users to export graph data in multiple formats.

### Requirements

#### 2.2.1: Create GraphExportMenu Component

**File**: `apps/web-vite/src/components/notes/GraphExportMenu.tsx`

**Features**:

- Dropdown menu similar to `ExportMenu` pattern
- Export options: JSON, GraphML, Mermaid
- Download functionality for each format
- Copy to clipboard option (for Mermaid)
- Success/error feedback (toast notifications)
- Click-outside to close

**Props**:

```typescript
export interface GraphExportMenuProps {
  graph: NoteGraph | null
  className?: string
}
```

**Export Options**:

1. **Download as JSON** - Save as `.json` file
2. **Download as GraphML** - Save as `.graphml` file (for Gephi, Cytoscape)
3. **Download as Mermaid** - Save as `.mmd` file
4. **Copy Mermaid** - Copy Mermaid diagram code to clipboard

**Implementation Details**:

- Use existing `exportGraphAsJSON`, `exportGraphAsGraphML`, `exportGraphAsMermaid` functions
- Generate filename: `note-graph-YYYY-MM-DD.json` (or `.graphml`, `.mmd`)
- Use Blob URL pattern for downloads (similar to `ExportMenu`)
- Show toast on successful copy
- Handle null graph gracefully (disable export if graph is null)

#### 2.2.2: Add Copy to Clipboard Utility

**File**: `apps/web-vite/src/notes/graphExport.ts`

**Changes**:

- Add `copyGraphAsMermaid` function
- Use Navigator Clipboard API with fallback
- Return Promise for async clipboard operations

**Function**:

```typescript
export async function copyGraphAsMermaid(graph: NoteGraph): Promise<void> {
  const mermaid = exportGraphAsMermaid(graph)
  // Use navigator.clipboard or fallback
}
```

#### 2.2.3: Integrate Export Menu into NoteGraphPage

**File**: `apps/web-vite/src/pages/NoteGraphPage.tsx`

**Changes**:

- Import `GraphExportMenu` component
- Add export button in page header (next to "View in Graph" or in sidebar)
- Pass graph data to export menu
- Handle export errors gracefully

**UI Placement**:

- Option 1: Add export button in page header (top right)
- Option 2: Add export button in sidebar (above GraphStats)
- Option 3: Add export option in existing menu (if any)

**Recommended**: Add in sidebar above GraphStats for consistency.

#### 2.2.4: Add CSS Styling

**File**: `apps/web-vite/src/components/notes/GraphExportMenu.css`

**Styles**:

- Export button styling (consistent with ExportMenu)
- Dropdown menu styling
- Export item styling (icon, title, description)
- Toast notification styling
- Disabled state (when graph is null)

### Acceptance Criteria

- [ ] Export button visible in graph page
- [ ] Dropdown shows 4 export options
- [ ] JSON export downloads `.json` file
- [ ] GraphML export downloads `.graphml` file
- [ ] Mermaid export downloads `.mmd` file
- [ ] Copy Mermaid copies to clipboard
- [ ] Toast notification shows on successful copy
- [ ] Export disabled when graph is null
- [ ] Filename includes date
- [ ] Files are properly formatted and valid

---

## Phase 2.3: Performance Optimization

### Goal

Optimize link extraction to avoid loading all notes on every create/update operation.

### Requirements

#### 2.3.1: Create Note Metadata Cache

**File**: `apps/web-vite/src/adapters/notes/noteMetadataCache.ts`

**Features**:

- In-memory cache mapping `noteId` to `{ title: string, archived: boolean }`
- Cache invalidation on note create/update/delete
- Cache population on first access
- Efficient lookup for link extraction

**Interface**:

```typescript
export interface NoteMetadata {
  noteId: NoteId
  title: string
  archived: boolean
}

export interface NoteMetadataCache {
  getMetadata(noteId: NoteId): NoteMetadata | null
  getAllMetadata(): NoteMetadata[]
  invalidate(noteId: NoteId): void
  invalidateAll(): void
  refresh(userId: string): Promise<void>
}
```

**Implementation**:

- Use Map for O(1) lookups
- Load metadata on first access (lazy loading)
- Batch load all note metadata once per session
- Invalidate cache when notes change
- Store minimal data (title, archived status)

#### 2.3.2: Update Link Extractor to Use Cache

**File**: `apps/web-vite/src/notes/linkExtractor.ts`

**Changes**:

- Update `extractNoteMentions` to accept `NoteMetadata[]` instead of `Note[]`
- Use cache for title matching instead of loading full notes
- Reduce memory footprint

**Function Signature**:

```typescript
export function extractNoteMentions(content: JSONContent, allNoteMetadata: NoteMetadata[]): NoteId[]
```

#### 2.3.3: Integrate Cache into Note Repository

**File**: `apps/web-vite/src/adapters/notes/firestoreNoteRepository.ts`

**Changes**:

- Import and initialize cache
- Invalidate cache on create/update/delete
- Use cache in `updateNoteLinks` instead of loading all notes
- Load cache metadata on first access

**Key Changes**:

```typescript
import { createNoteMetadataCache } from './noteMetadataCache'

const cache = createNoteMetadataCache()

// In create/update/delete:
cache.invalidate(noteId)

// In updateNoteLinks:
const allMetadata = cache.getAllMetadata()
const { linkedNoteIds, mentionedNoteIds } = updateNoteLinks(note, allMetadata)
```

#### 2.3.4: Add Cache Refresh Hook

**File**: `apps/web-vite/src/hooks/useNoteMetadataCache.ts`

**Features**:

- React hook to manage cache lifecycle
- Refresh cache on mount (if needed)
- Invalidate cache on note changes
- Expose cache instance for use in components

**Hook**:

```typescript
export function useNoteMetadataCache(userId: string | null) {
  // Refresh cache when userId changes
  // Return cache instance
}
```

#### 2.3.5: Optimize Graph Building

**File**: `apps/web-vite/src/adapters/notes/firestoreGraphRepository.ts`

**Changes**:

- Use cache for note metadata instead of loading full notes
- Only load full note data when needed (for `getConnectedNotes`, `getBacklinks`)
- Reduce initial graph build time

**Performance Improvements**:

- Graph building: Load only metadata for nodes
- Connected notes: Load full notes only when requested
- Backlinks: Use cache for initial filtering, load full notes on demand

### Acceptance Criteria

- [ ] Cache loads note metadata on first access
- [ ] Cache invalidates on note create/update/delete
- [ ] Link extraction uses cache instead of loading all notes
- [ ] Graph building uses cache for node metadata
- [ ] Full notes loaded only when needed
- [ ] Performance improvement measurable (reduced load time)
- [ ] Cache refreshes correctly on user switch
- [ ] No memory leaks (cache cleared on unmount)

---

## Implementation Order

1. **Phase 2.1: Note Link Autocomplete UI** (Highest user value)
   - 2.1.1: Create NoteLinkAutocomplete component
   - 2.1.2: Integrate into TipTapEditor
   - 2.1.3: Enhance NoteLink extension
   - 2.1.4: Add CSS styling

2. **Phase 2.2: Graph Export UI** (Medium user value)
   - 2.2.1: Create GraphExportMenu component
   - 2.2.2: Add copy to clipboard utility
   - 2.2.3: Integrate into NoteGraphPage
   - 2.2.4: Add CSS styling

3. **Phase 2.3: Performance Optimization** (Technical improvement)
   - 2.3.1: Create note metadata cache
   - 2.3.2: Update link extractor
   - 2.3.3: Integrate cache into repository
   - 2.3.4: Add cache refresh hook
   - 2.3.5: Optimize graph building

## Testing Considerations

### Phase 2.1 Testing

- Test autocomplete opens on `[[` typing
- Test filtering works correctly
- Test keyboard navigation
- Test selection converts to link
- Test edge cases (no matches, empty query, special characters)

### Phase 2.2 Testing

- Test all export formats generate valid files
- Test download functionality
- Test clipboard copy
- Test error handling (null graph, network errors)
- Test file naming

### Phase 2.3 Testing

- Test cache loads correctly
- Test cache invalidation
- Test performance improvement (measure load times)
- Test cache refresh on user switch
- Test memory usage (no leaks)

## Notes

- **Autocomplete**: Consider using a library like `@tiptap/suggestion` for more robust autocomplete, but custom implementation gives more control.
- **Export**: GraphML format is useful for external tools (Gephi, Cytoscape). Mermaid is useful for documentation.
- **Cache**: Consider using IndexedDB for persistent cache across sessions, but in-memory cache is sufficient for current needs.
- **Performance**: Monitor cache size and consider limits for very large note collections (1000+ notes).
