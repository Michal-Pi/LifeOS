# Notion-Style UX on TipTap — Implementation Plan

**Date:** 2025-01-07  
**Status:** Plan Ready for Implementation  
**Architecture:** Node-Based (TipTap/ProseMirror) with UX Layer

## Executive Summary

This plan adds a **Notion-like visual experience** on top of the existing TipTap node-based architecture. We keep ProseMirror's correctness while adding visual dividers, block menus, and improved interactions.

**Key Insight:** No architectural changes needed — just add a UX presentation layer that maps to TipTap commands.

---

## Current Implementation vs Requirements

### ✅ **Already Implemented**

| Feature                     | Status      | Implementation                               |
| --------------------------- | ----------- | -------------------------------------------- |
| **Node-Based Architecture** | ✅ Complete | TipTap/ProseMirror document model            |
| **Inline Marks**            | ✅ Complete | Bold (`strong`), Italic (`em`), Code, Strike |
| **Headings**                | ✅ Complete | H1-H6 via StarterKit                         |
| **Tables**                  | ✅ Complete | Table extension with resizable columns       |
| **Images**                  | ✅ Complete | Image extension with drag & drop             |
| **Lists**                   | ✅ Complete | Bullet, numbered, task lists                 |
| **Math Equations**          | ✅ Complete | Mathematics extension with KaTeX             |
| **Code Blocks**             | ✅ Complete | Code block extension                         |
| **History/Undo**            | ✅ Complete | ProseMirror history module                   |
| **Autosave**                | ✅ Complete | `useNoteEditor` hook                         |
| **Offline Support**         | ✅ Complete | IndexedDB + outbox pattern                   |

### ❌ **Missing (UX Layer)**

| Feature                    | Priority    | Complexity | TipTap Approach                     |
| -------------------------- | ----------- | ---------- | ----------------------------------- |
| **Visual Dividers**        | 🔴 Critical | Medium     | CSS overlay on top-level nodes      |
| **Enter Creates New Node** | 🔴 Critical | Medium     | Override Enter key handler          |
| **Drag Handles**           | 🔴 Critical | High       | Custom NodeView or overlay          |
| **Block Menu**             | 🔴 Critical | Medium     | Context menu component              |
| **/ Command Menu**         | 🔴 Critical | Medium     | Slash command handler               |
| **Tab Nesting**            | 🟡 High     | Low        | Use existing `sinkListItem` command |
| **Node Conversion**        | 🟡 High     | Low        | Use TipTap transform commands       |
| **Font Family/Size Marks** | 🟡 Medium   | Low        | Custom mark extensions              |
| **Superscript/Subscript**  | 🟡 Medium   | Low        | TipTap extensions available         |
| **Virtualized Scrolling**  | 🟡 Medium   | High       | Compatible with ProseMirror         |

---

## Architecture Overview

### Current Architecture

```
TipTapEditor
├── ProseMirror Document (node tree)
├── Extensions (StarterKit, Table, Image, etc.)
├── MenuBar (formatting toolbar)
└── EditorContent (renders document)
```

### Target Architecture (UX Layer Added)

```
TipTapEditor (Enhanced)
├── ProseMirror Document (node tree) ← UNCHANGED
├── Extensions (existing + new marks)
├── MenuBar (formatting toolbar)
├── UX Layer (NEW)
│   ├── NodeDivider (visual separators)
│   ├── DragHandle (reordering)
│   ├── BlockMenu (context menu)
│   ├── CommandMenu (slash menu)
│   └── KeyboardHandlers (Enter, Tab, /)
└── EditorContent (renders document)
```

**Key Principle:** All operations map to TipTap/ProseMirror commands. No custom block model.

---

## Implementation Plan

### Phase 1: Enter Key Override & Node Creation (Week 1)

**Goal:** Make Enter key create new top-level nodes instead of line breaks.

#### Tasks

1. **Override Enter Key Handler:**

   ```typescript
   // In TipTapEditor.tsx
   editorProps: {
     handleKeyDown: (view, event) => {
       if (event.key === 'Enter' && !event.shiftKey) {
         // Check if we're at end of top-level node
         const { $from } = view.state.selection
         const isAtEnd = $from.parentOffset === $from.parent.content.size
         const isTopLevel = $from.depth === 1

         if (isTopLevel && isAtEnd) {
           // Create new paragraph node
           editor.chain().focus().insertContent({ type: 'paragraph' }).run()
           return true
         }
       }
       return false
     }
   }
   ```

2. **Handle Edge Cases:**
   - Shift+Enter still creates line break
   - Enter in lists creates new list item
   - Enter in tables moves to next cell
   - Enter in code blocks creates new line

3. **Test Node Creation:**
   - Enter at end of paragraph → new paragraph
   - Enter in heading → new paragraph
   - Enter in list → new list item (existing behavior)

**Deliverables:**

- Enter key override
- Edge case handling
- Tests for all scenarios

---

### Phase 2: Visual Dividers & Drag Handles (Week 1-2)

**Goal:** Add Notion-like dividers between top-level nodes with drag handles.

#### Tasks

1. **Create NodeDivider Component:**

   ```typescript
   // NodeDivider.tsx
   interface NodeDividerProps {
     node: Node
     position: number
     onDragStart: (position: number) => void
     onMenuOpen: (position: number) => void
   }
   ```

2. **Detect Top-Level Nodes:**
   - Use ProseMirror's `Decoration` system
   - Add decorations after each top-level node
   - Show dividers on hover

3. **Implement Drag Handles:**
   - Use `@dnd-kit/core` for drag UI
   - Map drag end to ProseMirror transaction:
     ```typescript
     const tr = view.state.tr
     tr.move(posFrom, posTo)
     view.dispatch(tr)
     ```

4. **Styling:**
   - Divider appears on hover
   - Drag handle visible on hover
   - Smooth animations

**Deliverables:**

- `NodeDivider` component
- Drag & drop using ProseMirror transactions
- Hover states and animations

---

### Phase 3: Block Menu (Week 2)

**Goal:** Context menu for block operations (duplicate, delete, convert, move).

#### Tasks

1. **Create BlockMenu Component:**

   ```typescript
   // BlockMenu.tsx
   interface BlockMenuProps {
     node: Node
     position: number
     onDuplicate: () => void
     onDelete: () => void
     onConvert: (newType: string) => void
     onMove: (direction: 'up' | 'down') => void
   }
   ```

2. **Implement Operations:**
   - **Duplicate:**
     ```typescript
     const nodeJSON = node.toJSON()
     editor
       .chain()
       .insertContentAt(position + 1, nodeJSON)
       .run()
     ```
   - **Delete:**
     ```typescript
     editor.chain().focus().setNodeSelection(position).deleteSelection().run()
     ```
   - **Convert:**
     ```typescript
     // Paragraph → Heading
     editor.chain().focus().setNodeSelection(position).toggleHeading({ level: 1 }).run()
     ```
   - **Move:**
     ```typescript
     const tr = view.state.tr
     const targetPos = direction === 'up' ? position - 1 : position + 1
     tr.move(position, targetPos)
     view.dispatch(tr)
     ```

3. **Menu UI:**
   - Click divider handle opens menu
   - Keyboard shortcuts (Cmd+D duplicate, Delete key, etc.)
   - Smooth animations

**Deliverables:**

- `BlockMenu` component
- All block operations
- Keyboard shortcuts

---

### Phase 4: / Command Menu (Week 2-3)

**Goal:** Slash command menu for inserting nodes.

#### Tasks

1. **Detect Slash Command:**

   ```typescript
   // In editorProps.handleKeyDown
   if (event.key === '/' && $from.parentOffset === 0) {
     // Show command menu
     setShowCommandMenu(true)
     return true
   }
   ```

2. **Create CommandMenu Component:**

   ```typescript
   // CommandMenu.tsx
   interface Command {
     id: string
     label: string
     icon: string
     action: () => void
   }

   const commands: Command[] = [
     { id: 'heading1', label: 'Heading 1', action: () => insertHeading(1) },
     { id: 'heading2', label: 'Heading 2', action: () => insertHeading(2) },
     { id: 'bullet', label: 'Bullet List', action: () => insertBulletList() },
     { id: 'numbered', label: 'Numbered List', action: () => insertNumberedList() },
     { id: 'table', label: 'Table', action: () => insertTable() },
     { id: 'image', label: 'Image', action: () => insertImage() },
     { id: 'code', label: 'Code Block', action: () => insertCodeBlock() },
     { id: 'math', label: 'Math Equation', action: () => insertMath() },
     { id: 'quote', label: 'Quote', action: () => insertQuote() },
     { id: 'divider', label: 'Divider', action: () => insertDivider() },
   ]
   ```

3. **Filter Commands:**
   - Filter as user types after `/`
   - Keyboard navigation (arrow keys, Enter)
   - Insert node and remove `/` trigger

4. **Node Insertion:**
   ```typescript
   const insertHeading = (level: number) => {
     editor
       .chain()
       .focus()
       .deleteRange({ from: $from.pos - 1, to: $from.pos }) // Remove '/'
       .toggleHeading({ level })
       .run()
   }
   ```

**Deliverables:**

- `/` command detection
- `CommandMenu` component
- All node insertion commands
- Keyboard navigation

---

### Phase 5: Formatting Extensions (Week 3)

**Goal:** Add font family, font size, superscript, subscript marks.

#### Tasks

1. **Install Extensions:**

   ```bash
   pnpm add @tiptap/extension-text-style
   pnpm add @tiptap/extension-font-family
   pnpm add @tiptap/extension-superscript
   pnpm add @tiptap/extension-subscript
   ```

2. **Configure Extensions:**

   ```typescript
   import FontFamily from '@tiptap/extension-font-family'
   import Superscript from '@tiptap/extension-superscript'
   import Subscript from '@tiptap/extension-subscript'

   extensions: [
     // ... existing
     FontFamily.configure({
       types: ['paragraph', 'heading'],
     }),
     Superscript,
     Subscript,
   ]
   ```

3. **Update MenuBar:**
   - Add font family dropdown
   - Add font size dropdown
   - Add superscript/subscript buttons

4. **Scientific Notation Examples:**
   - 10⁻⁶ → Use subscript mark
   - CO₂ → Use subscript mark
   - E = mc² → Use superscript mark
   - Greek letters → Unicode input (α, β, γ, etc.)

**Deliverables:**

- Font family extension
- Font size extension (custom or use text-style)
- Superscript/subscript extensions
- Updated MenuBar

---

### Phase 6: Tab Nesting & Node Conversion (Week 3)

**Goal:** Tab key for nesting, improve node conversion.

#### Tasks

1. **Tab Key Handler:**

   ```typescript
   // In lists, Tab sinks list item
   if (event.key === 'Tab' && !event.shiftKey) {
     if (editor.isActive('listItem')) {
       editor.chain().focus().sinkListItem('listItem').run()
       return true
     }
   }

   // Shift+Tab lifts list item
   if (event.key === 'Tab' && event.shiftKey) {
     if (editor.isActive('listItem')) {
       editor.chain().focus().liftListItem('listItem').run()
       return true
     }
   }
   ```

2. **Node Conversion Menu:**
   - Add "Turn into" options in BlockMenu
   - Use TipTap transform commands:
     - Paragraph → Heading (toggleHeading)
     - Paragraph → List (wrapInBulletList)
     - Heading → Paragraph (setParagraph)
     - List → Paragraph (unwrapList)

3. **Conversion Preserves Content:**
   - TipTap commands handle this automatically
   - Test edge cases (nested lists, etc.)

**Deliverables:**

- Tab nesting for lists
- Node conversion menu
- Conversion tests

---

### Phase 7: Virtualized Scrolling (Week 4)

**Goal:** Support 10k+ nodes with virtualized scrolling.

#### Tasks

1. **Research Compatibility:**
   - ProseMirror works with virtual scrolling
   - Use `react-window` or `react-virtualized`
   - Render only visible nodes

2. **Implementation:**

   ```typescript
   // VirtualizedEditorContent.tsx
   import { FixedSizeList } from 'react-window'

   // Map top-level nodes to list items
   const topLevelNodes = doc.content.content

   <FixedSizeList
     height={containerHeight}
     itemCount={topLevelNodes.length}
     itemSize={estimatedNodeHeight}
   >
     {({ index, style }) => (
       <div style={style}>
         <NodeRenderer node={topLevelNodes[index]} />
       </div>
     )}
   </FixedSizeList>
   ```

3. **Maintain ProseMirror Integration:**
   - Keep editor state in sync
   - Handle selections across virtualized nodes
   - Test with large documents

**Deliverables:**

- Virtualized scrolling
- Performance tests (10k nodes)
- Selection handling

---

### Phase 8: Polish & Edge Cases (Week 4-5)

**Goal:** Handle edge cases and polish UX.

#### Tasks

1. **Edge Cases:**
   - Selections spanning multiple nodes
   - Large tables (virtualize cells if needed)
   - High-res images (lazy load, thumbnails)
   - Paste from web/PDF (use ProseMirror clipboard)
   - Scientific + normal fonts mixed

2. **Polish:**
   - Smooth animations
   - Loading states
   - Error handling
   - Accessibility (ARIA labels, keyboard nav)

3. **Testing:**
   - Unit tests for all operations
   - Integration tests
   - Performance benchmarks
   - Cross-browser testing

**Deliverables:**

- Edge case handling
- Polished UX
- Comprehensive test suite

---

## File Structure

```
apps/web-vite/src/components/editor/
├── TipTapEditor.tsx              # Main editor (enhanced)
├── TipTapMenuBar.tsx             # Formatting toolbar (updated)
├── ux/
│   ├── NodeDivider.tsx           # Visual dividers
│   ├── DragHandle.tsx            # Drag handles
│   ├── BlockMenu.tsx              # Context menu
│   ├── CommandMenu.tsx            # Slash command menu
│   └── keyboardHandlers.ts       # Enter, Tab, / handlers
├── extensions/
│   ├── fontFamily.ts             # Custom font family extension
│   ├── fontSize.ts                # Custom font size extension
│   └── index.ts
└── utils/
    ├── nodeOperations.ts          # Duplicate, delete, convert, move
    └── nodeDetection.ts           # Detect top-level nodes
```

---

## Technical Decisions

### Libraries to Add

```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.0.0",
    "@dnd-kit/utilities": "^3.2.0",
    "@tiptap/extension-text-style": "^2.0.0",
    "@tiptap/extension-font-family": "^2.0.0",
    "@tiptap/extension-superscript": "^2.0.0",
    "@tiptap/extension-subscript": "^2.0.0",
    "react-window": "^1.8.10"
  }
}
```

### Key Principles

1. **All operations use TipTap commands** — no custom block model
2. **Dividers are visual only** — map to node positions
3. **Drag & drop uses ProseMirror transactions** — `tr.move()`
4. **Node conversion uses TipTap transforms** — `toggleHeading()`, `wrapInList()`, etc.
5. **State stays in ProseMirror** — single source of truth

---

## Migration Strategy

### Step 1: Add UX Layer (Non-Breaking)

- Add dividers, menus, handlers alongside existing editor
- Feature flag to enable/disable
- Test with existing notes

### Step 2: Enable by Default

- Enable for all users
- Monitor for issues
- Gather feedback

### Step 3: Remove Old UI (Optional)

- If old MenuBar becomes redundant, remove
- Keep backward compatibility

---

## Success Metrics

- ✅ Editor ready < 1s
- ✅ Node creation < 100ms
- ✅ 99.9% formatting fidelity
- ✅ 10k nodes usable (with virtualization)
- ✅ All node types supported
- ✅ Drag & drop smooth (< 60fps)
- ✅ Offline read/edit works

---

## Risks & Mitigations

| Risk                         | Impact | Mitigation                             |
| ---------------------------- | ------ | -------------------------------------- |
| Enter key conflicts          | Medium | Careful edge case handling             |
| Drag & drop performance      | Medium | Use ProseMirror transactions, optimize |
| Virtual scrolling complexity | High   | Research thoroughly, test early        |
| Node conversion edge cases   | Medium | Comprehensive testing                  |

---

## Next Steps

1. ✅ **Review this plan**
2. **Approve approach** (node-based + UX layer)
3. **Set up development branch**
4. **Begin Phase 1** (Enter key override)
5. **Weekly progress reviews**

---

## Questions Resolved

✅ Keep node-based architecture  
✅ Use TipTap commands for all operations  
✅ Dividers are visual presentation layer  
✅ No custom block model needed  
✅ Leverage existing ProseMirror features
