# Paragraph-Level Tagging & AI Analysis - Implementation Summary

## Overview

This implementation adds paragraph-level tagging (like tags for paragraphs) and AI-powered analysis to identify and tag paragraphs/ideas in notes.

## What Was Implemented

### 1. Extended Note Model

**File**: `packages/notes/src/domain/models.ts`

Added `paragraphLinks` field to Note interface:

```typescript
paragraphLinks?: Record<string, {
  noteIds?: NoteId[]
  topicIds?: TopicId[]
}>
```

Maps paragraph positions (JSON path strings) to arrays of linked note/topic IDs.

### 2. Paragraph Tag TipTap Extension

**File**: `apps/web-vite/src/components/editor/extensions/ParagraphTag.tsx`

- Adds `paragraphTagNoteId` and `paragraphTagTopicId` attributes to paragraph/heading nodes
- Commands: `setParagraphTag`, `removeParagraphTag`
- Visual indicators (colored border) for tagged paragraphs

### 3. Paragraph Tag Menu UI

**Files**:

- `apps/web-vite/src/components/editor/ux/ParagraphTagMenu.tsx`
- `apps/web-vite/src/components/editor/ux/ParagraphTagMenu.css`

- Dropdown menu for selecting notes/topics to tag paragraphs
- Tabs for switching between notes and topics
- Search functionality
- Visual styling for tagged paragraphs

### 4. AI Agent Tools

**File**: `functions/src/agents/advancedTools.ts`

#### `analyze_note_paragraphs`

- Analyzes a note and identifies key paragraphs/ideas
- Returns structured data about each paragraph (path, text, type, position)
- Filters paragraphs by minimum length

#### `tag_paragraph_with_note`

- Tags a specific paragraph with a note or topic
- Updates `paragraphLinks` in the note document
- Also updates `linkedNoteIds` if tagging with a note
- Creates relationships in the knowledge graph

### 5. Tool Registration

**Files**:

- `functions/src/agents/advancedTools.ts` (export)
- `apps/web-vite/src/agents/builtinTools.ts` (metadata)

Both tools are registered and available to agents.

## Next Steps (To Complete)

### 1. Integrate ParagraphTag Extension into TipTapEditor

**File**: `apps/web-vite/src/components/editor/TipTapEditor.tsx`

- Import `ParagraphTag` extension
- Add to extensions array
- Add keyboard shortcut (e.g., Cmd/Ctrl+T) to open tag menu
- Handle tag menu state and positioning

### 2. Add AI Analysis UI to NoteEditor

**File**: `apps/web-vite/src/components/editor/NoteEditor.tsx`

- Add "Analyze with AI" button
- Create modal/panel for AI analysis results
- Show identified paragraphs with preview text
- Allow user to approve/reject tags
- Batch tag paragraphs

### 3. Update Graph Building

**File**: `apps/web-vite/src/adapters/notes/firestoreGraphRepository.ts`

- Include paragraph-level links when building graph
- Create edges from paragraph tags
- Update edge types to include `paragraph_tag`

### 4. Extract Paragraph Links from Content

**File**: `apps/web-vite/src/notes/linkExtractor.ts`

- Add function to extract paragraph tags from ProseMirror JSON
- Update `updateNoteLinks` to include paragraph links
- Sync paragraph links when note content changes

### 5. Update Note Repository

**File**: `apps/web-vite/src/adapters/notes/firestoreNoteRepository.ts`

- Handle `paragraphLinks` in create/update operations
- Sync paragraph links when content changes
- Recompute graph relationships when paragraph links change

## Usage Example

### Manual Tagging

1. User selects a paragraph
2. Presses Cmd/Ctrl+T
3. Selects a note or topic from dropdown
4. Paragraph gets tagged and visual indicator appears

### AI-Powered Tagging

1. User clicks "Analyze with AI" button
2. Agent analyzes note and identifies paragraphs
3. Agent suggests tags for each paragraph
4. User reviews and approves tags
5. Tags are applied and graph relationships created

## Benefits

1. **Granular Linking**: Link specific ideas/paragraphs, not just entire notes
2. **AI Assistance**: Automatically identify and tag key concepts
3. **Better Graph**: More detailed knowledge graph with paragraph-level relationships
4. **Tag-like UX**: Familiar tagging interface for linking

## Technical Notes

- Paragraph paths use JSON path notation (e.g., "0.1" for second paragraph in first section)
- Tags are stored as node attributes in ProseMirror JSON
- Graph edges are created from paragraph tags automatically
- Backlinks are computed for paragraph-level links too
