# Block Editor Requirements Analysis

**Date:** 2025-01-07  
**Status:** Analysis Complete - Implementation Plan Required

## Executive Summary

The current TipTap-based editor is **node-based** (ProseMirror document model), while the requirements specify a **block-based** architecture similar to Notion. This is a fundamental architectural difference that requires significant refactoring.

**Key Finding:** TipTap/ProseMirror can be adapted to support block-based editing, but it requires a custom layer on top of the existing editor.

---

## Current Implementation vs Requirements

### ✅ **Implemented Features**

| Feature               | Status      | Notes                                                                        |
| --------------------- | ----------- | ---------------------------------------------------------------------------- |
| **Offline Support**   | ✅ Complete | IndexedDB (`offlineStore.ts`), outbox pattern (`noteOutbox.ts`), sync worker |
| **Autosave**          | ✅ Complete | `useNoteEditor` hook with configurable delay                                 |
| **Endless Scrolling** | ✅ Complete | Fixed in recent changes (removed height constraints)                         |
| **Basic Formatting**  | ✅ Partial  | Bold, italic, strikethrough, code via MenuBar                                |
| **Headings**          | ✅ Complete | H1-H6 supported via StarterKit                                               |
| **Tables**            | ✅ Complete | Table extension with resizable columns                                       |
| **Images**            | ✅ Complete | Image extension with drag & drop, base64 support                             |
| **Math Equations**    | ✅ Complete | Mathematics extension with KaTeX                                             |
| **Lists**             | ✅ Complete | Bullet, numbered, task lists                                                 |
| **Code Blocks**       | ✅ Complete | Code block extension                                                         |
| **History/Undo**      | ✅ Complete | Built into StarterKit                                                        |

### ❌ **Missing Features**

| Feature                         | Priority    | Complexity | Impact                              |
| ------------------------------- | ----------- | ---------- | ----------------------------------- |
| **Block-Based Model**           | 🔴 Critical | High       | Fundamental architecture change     |
| **Block Dividers**              | 🔴 Critical | Medium     | Visual separators with drag handles |
| **Block Menu**                  | 🔴 Critical | Medium     | Duplicate, delete, convert, move    |
| **/ Command Menu**              | 🔴 Critical | Medium     | Slash command for block insertion   |
| **Enter Creates New Block**     | 🔴 Critical | High       | Override default Enter behavior     |
| **Tab for Nesting**             | 🟡 High     | Medium     | Nested block support                |
| **Drag & Drop Reordering**      | 🔴 Critical | High       | Smooth block reordering             |
| **Block Conversion**            | 🟡 High     | Medium     | Convert between block types         |
| **Font Families**               | 🟡 Medium   | Low        | Custom extension needed             |
| **Font Sizes (per selection)**  | 🟡 Medium   | Low        | Custom extension needed             |
| **Superscript/Subscript**       | 🟡 Medium   | Low        | TipTap extension available          |
| **Greek Letters**               | 🟢 Low      | Low        | Unicode/input method                |
| **Virtualized Scrolling**       | 🟡 Medium   | High       | For 10k+ blocks                     |
| **Toggle/Collapsible Sections** | 🟢 Low      | Medium     | Custom block type                   |

---

## Architecture Analysis

### Current Architecture

```
TipTapEditor (Node-Based)
├── ProseMirror Document Model
│   ├── Nodes (paragraph, heading, list_item, etc.)
│   ├── Marks (bold, italic, etc.)
│   └── Schema (hierarchical structure)
├── Extensions
│   ├── StarterKit (paragraphs, headings, lists)
│   ├── Table, Image, Mathematics
│   └── Custom extensions
└── State Management
    └── JSONContent (ProseMirror JSON)
```

**Characteristics:**

- Document is a tree of nodes
- Enter key creates line breaks within nodes
- No explicit "block" concept
- Drag & drop is node-level, not block-level

### Required Architecture

```
BlockEditor (Block-Based)
├── Block Model
│   ├── Block Types (paragraph, heading, image, table, etc.)
│   ├── Block Properties (id, type, position, children, style)
│   └── Block Array (ordered sequence)
├── Block Components
│   ├── BlockRenderer (renders each block)
│   ├── BlockDivider (hover handles, drag, menu)
│   └── BlockMenu (duplicate, delete, convert, move)
├── Block Operations
│   ├── Insert (via / command or toolbar)
│   ├── Convert (change block type)
│   ├── Reorder (drag & drop)
│   └── Nest (Tab key)
└── State Management
    └── Block Array (ordered list of blocks)
```

**Characteristics:**

- Document is an array of blocks
- Enter key creates new block
- Each block is independent
- Drag & drop is block-level

---

## Implementation Strategy

### Option 1: Build Block Layer on TipTap (Recommended)

**Approach:** Create a block abstraction layer that wraps TipTap nodes.

**Pros:**

- Leverages existing TipTap infrastructure
- Maintains compatibility with current data model
- Can migrate gradually
- Rich formatting already works

**Cons:**

- Complex mapping between blocks and nodes
- Need to override Enter key behavior
- Drag & drop requires custom implementation
- May have performance issues with large documents

**Implementation:**

1. Create `Block` interface and `BlockEditor` component
2. Map TipTap nodes to blocks (1:1 or 1:many)
3. Override Enter key to create new blocks
4. Implement block dividers as overlays
5. Add drag & drop using `@dnd-kit` or similar
6. Create / command menu component
7. Add block menu with operations

### Option 2: Custom Block Editor (Not Recommended)

**Approach:** Build a completely custom block editor from scratch.

**Pros:**

- Full control over architecture
- Optimized for block model
- No legacy constraints

**Cons:**

- Massive development effort (months)
- Lose all existing TipTap features
- Need to reimplement formatting, tables, math, etc.
- High risk of bugs and regressions

---

## Detailed Implementation Plan

### Phase 1: Block Model Foundation (Week 1-2)

**Goal:** Define block data model and basic rendering.

**Tasks:**

1. Create `Block` interface:

   ```typescript
   interface Block {
     id: string
     type: BlockType
     position: number
     content: JSONContent // TipTap content
     style?: BlockStyle
     children?: Block[] // For nested blocks
   }

   type BlockType =
     | 'paragraph'
     | 'heading1'
     | 'heading2'
     | 'heading3'
     | 'bulletList'
     | 'numberedList'
     | 'taskList'
     | 'image'
     | 'table'
     | 'codeBlock'
     | 'math'
     | 'quote'
     | 'divider'
   ```

2. Create `BlockEditor` component:
   - Renders array of blocks
   - Each block in its own container
   - Block dividers between blocks

3. Create block-to-node mapping:
   - Convert TipTap JSONContent to blocks
   - Convert blocks back to TipTap content
   - Handle edge cases (nested lists, etc.)

**Deliverables:**

- `Block` interface and types
- `BlockEditor` component (basic rendering)
- Block conversion utilities

---

### Phase 2: Block Interactions (Week 2-3)

**Goal:** Implement core block interactions.

**Tasks:**

1. **Enter Key Override:**
   - Intercept Enter key
   - Create new block instead of line break
   - Maintain cursor position

2. **Block Dividers:**
   - Show on hover
   - Drag handle for reordering
   - Click to show block menu

3. **Drag & Drop:**
   - Use `@dnd-kit/core` library
   - Smooth animations
   - Maintain focus after drop
   - Update block positions

4. **Block Menu:**
   - Duplicate block
   - Delete block
   - Convert block type
   - Move up/down

**Deliverables:**

- Enter key handler
- Block divider component
- Drag & drop implementation
- Block menu component

---

### Phase 3: / Command Menu (Week 3-4)

**Goal:** Implement slash command for block insertion.

**Tasks:**

1. Create `/` command handler:
   - Detect `/` at start of block
   - Show command menu
   - Filter commands as user types

2. Command menu UI:
   - List of block types
   - Icons and descriptions
   - Keyboard navigation

3. Block insertion:
   - Insert new block of selected type
   - Focus new block
   - Remove `/` trigger

**Deliverables:**

- `/` command handler
- Command menu component
- Block insertion logic

---

### Phase 4: Advanced Features (Week 4-5)

**Goal:** Add remaining formatting and features.

**Tasks:**

1. **Tab Nesting:**
   - Tab key creates nested block
   - Shift+Tab un-nests
   - Visual indentation

2. **Block Conversion:**
   - Convert paragraph → heading
   - Convert text → list
   - Convert list → paragraph
   - Preserve content during conversion

3. **Font Extensions:**
   - Install `@tiptap/extension-text-style`
   - Add font family extension
   - Add font size extension
   - Update MenuBar

4. **Scientific Notation:**
   - Install `@tiptap/extension-superscript`
   - Install `@tiptap/extension-subscript`
   - Add Greek letter input helper
   - Update MenuBar

**Deliverables:**

- Tab nesting support
- Block conversion utilities
- Font family/size extensions
- Superscript/subscript support

---

### Phase 5: Performance & Polish (Week 5-6)

**Goal:** Optimize for large documents and polish UX.

**Tasks:**

1. **Virtualized Scrolling:**
   - Use `react-window` or `react-virtualized`
   - Render only visible blocks
   - Maintain scroll position

2. **Optimization:**
   - Memoize block components
   - Debounce autosave
   - Lazy load images

3. **Edge Cases:**
   - Large tables (virtualize cells)
   - High-res images (lazy load, thumbnails)
   - Copy/paste from web/PDF
   - Undo/redo with blocks

4. **Testing:**
   - Unit tests for block operations
   - Integration tests for editor
   - Performance tests (10k blocks)

**Deliverables:**

- Virtualized scrolling
- Performance optimizations
- Edge case handling
- Test suite

---

## Technical Decisions

### Libraries to Add

```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.0.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.0",
    "@tiptap/extension-text-style": "^2.0.0",
    "@tiptap/extension-font-family": "^2.0.0",
    "@tiptap/extension-superscript": "^2.0.0",
    "@tiptap/extension-subscript": "^2.0.0",
    "react-window": "^1.8.10"
  }
}
```

### File Structure

```
apps/web-vite/src/components/editor/
├── blocks/
│   ├── BlockEditor.tsx          # Main block editor component
│   ├── BlockRenderer.tsx        # Renders individual blocks
│   ├── BlockDivider.tsx         # Divider with drag handle
│   ├── BlockMenu.tsx            # Context menu for blocks
│   ├── CommandMenu.tsx           # / command menu
│   └── types.ts                 # Block interfaces
├── TipTapEditor.tsx             # Keep for backward compatibility
├── TipTapMenuBar.tsx            # Update for new features
└── utils/
    ├── blockConverter.ts        # Block ↔ TipTap conversion
    ├── blockOperations.ts       # Insert, delete, convert, etc.
    └── keyboardHandlers.ts      # Enter, Tab, / handlers
```

---

## Migration Strategy

### Step 1: Parallel Implementation

- Build `BlockEditor` alongside existing `TipTapEditor`
- Use feature flag to switch between editors
- Test with real notes

### Step 2: Data Migration

- Convert existing TipTap JSONContent to blocks
- Ensure backward compatibility
- Test migration with all note types

### Step 3: Gradual Rollout

- Enable for new notes first
- Migrate existing notes on open
- Monitor for issues

### Step 4: Full Migration

- Remove old `TipTapEditor` (or keep as fallback)
- Update all references
- Remove feature flag

---

## Success Metrics

- ✅ Time to first note < 1 second
- ✅ Block creation latency < 100ms
- ✅ 99.9% formatting fidelity
- ✅ Documents with 10k blocks usable
- ✅ Offline read/edit works
- ✅ All block types supported
- ✅ Drag & drop smooth (< 60fps)

---

## Risks & Mitigations

| Risk                        | Impact | Mitigation                               |
| --------------------------- | ------ | ---------------------------------------- |
| Performance with large docs | High   | Virtualized scrolling, lazy loading      |
| Data migration issues       | High   | Thorough testing, backward compatibility |
| Loss of formatting          | High   | Comprehensive conversion tests           |
| User confusion              | Medium | Gradual rollout, tutorials               |
| Development time            | Medium | Phased approach, MVP first               |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Approve architecture** (Option 1 recommended)
3. **Set up development branch** for block editor
4. **Begin Phase 1** (Block Model Foundation)
5. **Weekly progress reviews**

---

## Questions to Resolve

1. Should we maintain backward compatibility with old TipTap format?
2. Do we need collapsible sections in MVP?
3. What's the priority for virtualized scrolling?
4. Should block conversion preserve all formatting?
5. Do we need block templates?
