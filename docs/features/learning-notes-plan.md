# Learning/Notes Feature - Implementation Plan

**Status:** 📋 Planning Complete - Ready to Start
**Created:** 2025-12-25
**Target Completion:** 8 weeks
**Priority:** High

## Overview

A fully-powered, offline-capable note-taking and learning management system with rich text editing, scientific notation support, and project integration.

## Key Features

### Core Capabilities

- ✅ **Rich Text Editor** - TipTap (ProseMirror-based) with full formatting
- ✅ **Scientific Notation** - LaTeX math and physics notation via KaTeX
- ✅ **Media Support** - Images, tables, structured data
- ✅ **Offline-First** - Full offline capability with IndexedDB
- ✅ **Organization** - Topics → Sections → Notes hierarchy
- ✅ **Project Integration** - Link notes to Projects and OKRs
- ✅ **Learning Projects** - Track learning with chapters and Key Results

## Architecture

### Data Models

#### Note Document

```typescript
interface Note {
  noteId: string // UUID
  userId: string // Owner

  // Content
  title: string
  content: object // ProseMirror JSON
  contentHtml?: string // Cached HTML for search/preview

  // Organization
  topicId: string | null // Parent topic (folder)
  sectionId: string | null // Parent section (subfolder)

  // Associations
  projectIds: string[] // Linked projects
  okrIds: string[] // Linked OKRs
  tags: string[] // User tags

  // Metadata
  createdAtMs: number
  updatedAtMs: number
  lastAccessedAtMs: number

  // Offline sync
  syncState: 'synced' | 'pending' | 'conflict'
  version: number // For conflict resolution

  // Attachments
  attachmentIds: string[] // References to Attachment documents
}
```

#### Topic (Folder)

```typescript
interface Topic {
  topicId: string
  userId: string

  name: string
  description?: string
  color?: string // UI color coding
  icon?: string // Emoji or icon identifier

  parentTopicId: string | null // For nested topics
  order: number // Display order

  createdAtMs: number
  updatedAtMs: number
}
```

#### Section (Subfolder)

```typescript
interface Section {
  sectionId: string
  userId: string
  topicId: string // Parent topic

  name: string
  description?: string
  order: number

  createdAtMs: number
  updatedAtMs: number
}
```

#### Attachment

```typescript
interface Attachment {
  attachmentId: string
  userId: string
  noteId: string

  // File info
  fileName: string
  fileType: string // MIME type
  fileSizeBytes: number

  // Storage
  storageUrl?: string // Firebase Storage URL (when synced)
  localBlob?: Blob // Local-only until synced

  // Metadata
  uploadedAtMs: number
  syncState: 'local' | 'uploading' | 'synced' | 'error'
}
```

### Technology Stack

#### Editor: TipTap

- **Why TipTap over alternatives:**
  - Modern React integration
  - ProseMirror-based (extensible, robust)
  - Better TypeScript support than Draft.js
  - Active maintenance (vs Slate.js)
  - Rich extension ecosystem

#### Math Rendering: KaTeX

- **Why KaTeX over MathJax:**
  - 10x faster rendering
  - No external dependencies for offline
  - Smaller bundle size
  - Supports most common LaTeX commands

#### Storage: IndexedDB + Firestore

- **IndexedDB** for offline-first local storage
- **Firestore** for cloud sync and multi-device access
- **Firebase Storage** for large attachments

### TipTap Editor Configuration

```typescript
// Core extensions
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Mathematics from '@tiptap/extension-mathematics'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      history: { depth: 100 },
      heading: { levels: [1, 2, 3, 4] },
    }),
    Image.configure({
      inline: true,
      allowBase64: true, // For offline images
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableCell,
    TableHeader,
    Mathematics.configure({
      katexOptions: {
        throwOnError: false,
        displayMode: false,
      },
    }),
    Highlight.configure({
      multicolor: true,
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Placeholder.configure({
      placeholder: 'Start writing your notes...',
    }),
    CharacterCount,
  ],
  content: initialContent,
  editable: true,
  autofocus: true,
})
```

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Status:** ✅ Complete (2025-12-25)

#### Tasks

- [x] Set up data models (Note, Topic, Section, Attachment)
- [x] Create Firestore repositories
- [ ] Set up IndexedDB schema and repository (Deferred to Phase 6)
- [ ] Create basic offline sync queue pattern (Deferred to Phase 6)
- [x] Add TipTap dependencies
- [x] Set up KaTeX dependencies

#### Files to Create

```
packages/notes/
├── src/
│   ├── domain/
│   │   ├── models.ts              # Note, Topic, Section, Attachment interfaces
│   │   └── validation.ts          # Data validation
│   ├── repositories/
│   │   ├── noteRepository.ts      # Abstract interface
│   │   └── topicRepository.ts     # Abstract interface
│   └── index.ts
├── package.json
└── tsconfig.json

apps/web-vite/src/
├── adapters/
│   ├── firestoreNoteRepository.ts
│   ├── firestoreTopicRepository.ts
│   └── indexedDBNoteRepository.ts # Offline storage
└── lib/
    └── indexedDB.ts               # IndexedDB setup
```

#### Deliverables

- ✅ TypeScript interfaces for all data models
- ✅ Repository pattern with Firestore implementations
- ✅ Validation logic for all entities
- ✅ Firebase Storage integration for attachments

**Git Commits:**

- f0d7491: Phase 1 foundation (package, models, validation, ports)
- 7d81a16: Firestore adapters and Firebase Storage support

---

### Phase 2: TipTap Editor Integration (Week 2-3)

**Status:** ✅ Complete (2025-12-25)

#### Tasks

- [x] Create NoteEditor component with TipTap
- [x] Configure TipTap extensions (StarterKit, Image, Table)
- [x] Add KaTeX extension for math support
- [x] Implement auto-save functionality
- [ ] Add toolbar with formatting controls (Deferred to Phase 3)
- [ ] Test offline editing and content persistence (Deferred to Phase 6)

#### Files to Create

```
apps/web-vite/src/
├── components/notes/
│   ├── NoteEditor.tsx             # Main editor component
│   ├── EditorToolbar.tsx          # Formatting toolbar
│   ├── MathInput.tsx              # LaTeX input helper
│   └── TableControls.tsx          # Table manipulation
├── hooks/
│   ├── useNoteEditor.ts           # Editor state management
│   └── useAutoSave.ts             # Auto-save logic
└── styles/
    └── editor.css                 # TipTap styling
```

#### Deliverables

- ✅ Fully functional rich text editor (TipTapEditor component)
- ✅ Math equation support with KaTeX
- ✅ Table creation and editing
- ✅ Image insertion (inline and base64)
- ✅ Task lists with checkbox support
- ✅ Code blocks with styling
- ✅ Highlight, blockquotes, horizontal rules
- ✅ Auto-save with configurable delay (useNoteEditor hook)
- ✅ Save status indicator (Saving/Unsaved/Saved)
- ✅ Character count tracking

**Git Commit:**

- d72a744: Add TipTap editor components for Notes Phase 2

**Files Created:**

- apps/web-vite/src/components/editor/TipTapEditor.tsx
- apps/web-vite/src/components/editor/TipTapEditor.css
- apps/web-vite/src/components/editor/NoteEditor.tsx
- apps/web-vite/src/components/editor/index.ts
- apps/web-vite/src/hooks/useNoteEditor.ts

---

### Phase 3: Organization Structure (Week 3-4)

**Status:** ✅ Complete (2025-12-25)

#### Tasks

- [x] Create Topic management hooks
- [x] Create Section management hooks
- [x] Create note operations hooks
- [x] Build NotesPage with list/editor UI
- [ ] Build hierarchical navigation sidebar (Deferred to Phase 4)
- [ ] Implement drag-and-drop for organization (Deferred to Phase 4)
- [ ] Add note search functionality (Deferred to Phase 4)

#### Files Created

```
apps/web-vite/src/
├── hooks/
│   ├── useNoteOperations.ts       # Note CRUD with auto-save
│   ├── useTopics.ts               # Topic CRUD operations
│   └── useSections.ts             # Section CRUD operations
└── pages/
    └── NotesPage.tsx              # Two-column list/editor UI
```

#### Deliverables

- ✅ useNoteOperations hook with full CRUD operations
- ✅ useTopics hook with ordering support
- ✅ useSections hook with topic filtering
- ✅ NotesPage with two-column layout (list + editor)
- ✅ Auto-save integration (2-second debounce)
- ✅ Loading states and error handling
- ✅ Note list with title, preview, and updated date
- ✅ Click-to-select note interaction

**Git Commit:**

- 709316e: Add Notes Phase 3: Organization structure with hooks and UI

**Files Created:**

- apps/web-vite/src/hooks/useNoteOperations.ts
- apps/web-vite/src/hooks/useTopics.ts
- apps/web-vite/src/hooks/useSections.ts
- apps/web-vite/src/pages/NotesPage.tsx (replaced placeholder)

---

### Phase 4: Enhanced Organization & Navigation (Week 4-5)

**Status:** ✅ Phase 4A Complete (2025-12-25)

**Note:** Adjusted to prioritize UI enhancements deferred from Phase 3 before tackling project integration.

#### Phase 4A: Navigation & Organization UI

**Status:** ✅ Complete (2025-12-25)

##### Tasks

- [x] Add hierarchical navigation sidebar (Topics/Sections)
- [x] Implement topic create/edit/delete UI
- [x] Implement section create/edit/delete UI
- [x] Add search functionality for notes
- [ ] Add drag-and-drop for organization (Deferred - not essential)

##### Deliverables

- ✅ TopicSidebar component with full hierarchy
- ✅ Inline topic/section creation with keyboard shortcuts
- ✅ Delete confirmations for topics/sections
- ✅ Three-column layout: Sidebar | Note List | Editor
- ✅ Topic/Section filtering of notes
- ✅ Full-text search across titles and content
- ✅ Auto-assign notes to selected topic/section
- ✅ Context-aware empty states

**Git Commit:**

- 87c31e9: Add Notes Phase 4A: Enhanced navigation and organization UI

**Files Created:**

- apps/web-vite/src/components/notes/TopicSidebar.tsx

**Files Modified:**

- apps/web-vite/src/pages/NotesPage.tsx

#### Phase 4B: Project Integration (Original Phase 4)

**Status:** ✅ Complete (2025-12-26)

#### Tasks

- [x] Add project linking UI in note editor
- [ ] Create OKR linking UI in note editor (Deferred - not essential for MVP)
- [ ] Show linked notes in project detail view (Deferred to Phase 7)
- [ ] Show linked notes in OKR detail view (Deferred to Phase 7)
- [ ] Add "Create learning project" workflow (Deferred to Phase 7)
- [ ] Implement learning chapters (Deferred to Phase 7)

#### Files to Create

```
apps/web-vite/src/
├── components/notes/
│   ├── ProjectLinker.tsx          # Link to projects
│   ├── OKRLinker.tsx              # Link to OKRs
│   └── LinkedNotesPanel.tsx       # Show linked notes
├── hooks/
│   └── useNoteLinking.ts          # Linking operations
└── components/projects/
    └── LearningProjectCard.tsx    # Special project type
```

#### Deliverables

- ✅ Notes can be linked to multiple projects
- ✅ ProjectLinker component for managing project links
- ✅ Integration with existing todo/project system
- ⬜ Notes can be linked to specific OKRs (Deferred to Phase 7)
- ⬜ Projects show all linked notes (Deferred to Phase 7)
- ⬜ Special "Learning Project" template (Deferred to Phase 7)
- ⬜ Learning chapters integrated with KRs (Deferred to Phase 7)

**Git Commit:**

- b4c8e79: Add Notes Phase 4B (Project Integration) and Phase 5 (Attachments & Media)

**Files Created:**

- apps/web-vite/src/components/notes/ProjectLinker.tsx
- apps/web-vite/src/components/notes/AttachmentUploader.tsx
- apps/web-vite/src/hooks/useAttachments.ts

**Files Modified:**

- apps/web-vite/src/components/editor/NoteEditor.tsx
- apps/web-vite/src/hooks/useNoteOperations.ts
- apps/web-vite/src/pages/NotesPage.tsx

---

### Phase 5: Attachments & Media (Week 5-6)

**Status:** ✅ Complete (2025-12-26)

#### Tasks

- [x] Implement file upload for attachments
- [x] Create attachment manager UI
- [x] Set up Firebase Storage integration
- [ ] Add image optimization and thumbnails (Deferred - basic optimization only)
- [ ] Implement offline attachment queue (Deferred to Phase 6)
- [x] Add paste-image-from-clipboard support

#### Files to Create

```
apps/web-vite/src/
├── components/notes/
│   ├── AttachmentUploader.tsx     # File upload
│   ├── AttachmentList.tsx         # Show attachments
│   └── ImageOptimizer.tsx         # Client-side optimization
├── hooks/
│   ├── useAttachments.ts          # Attachment CRUD
│   └── useFileUpload.ts           # Upload with progress
└── lib/
    ├── imageOptimization.ts       # Resize/compress images
    └── firebaseStorage.ts         # Storage helpers
```

#### Deliverables

- ✅ File upload with progress indication
- ✅ AttachmentUploader component with drag-drop support
- ✅ Firebase Storage integration with proper path structure
- ✅ useAttachments hook for file management
- ✅ Paste images/files from clipboard
- ✅ Image previews for image attachments
- ✅ File size formatting and display
- ⬜ Image optimization before upload (Deferred - basic only)
- ⬜ Offline attachment queue (Deferred to Phase 6)

**Git Commit:**

- b4c8e79: Add Notes Phase 4B (Project Integration) and Phase 5 (Attachments & Media)

**Files Created:**

- apps/web-vite/src/components/notes/AttachmentUploader.tsx
- apps/web-vite/src/hooks/useAttachments.ts

---

### Phase 6: Offline Sync & Conflict Resolution (Week 6-7)

**Status:** ⬜ Not Started

#### Tasks

- [ ] Implement offline operation queue
- [ ] Add sync status indicators
- [ ] Build conflict resolution UI
- [ ] Add version control for notes
- [ ] Implement "last write wins" with manual override
- [ ] Test offline → online sync scenarios

#### Files to Create

```
apps/web-vite/src/
├── components/notes/
│   ├── SyncStatusBadge.tsx        # Sync indicator
│   └── ConflictResolver.tsx       # Resolve conflicts
├── hooks/
│   ├── useNoteSync.ts             # Sync operations
│   └── useConflictResolution.ts   # Handle conflicts
└── sync/
    ├── noteSyncWorker.ts          # Background sync
    └── conflictDetection.ts       # Detect conflicts
```

#### Deliverables

- ✅ Offline queue for all note operations
- ✅ Automatic sync when online
- ✅ Conflict detection and resolution
- ✅ Version history (last 10 versions)
- ✅ Manual conflict resolution UI

---

### Phase 7: Advanced Features (Week 7-8)

**Status:** ⬜ Not Started

#### Tasks

- [ ] Add collaborative editing foundations (read-only share)
- [ ] Implement note templates
- [ ] Add export functionality (Markdown, PDF)
- [ ] Create learning progress dashboard
- [ ] Add statistics (word count, reading time)
- [ ] Implement note archiving

#### Files to Create

```
apps/web-vite/src/
├── components/notes/
│   ├── NoteTemplates.tsx          # Template gallery
│   ├── ExportDialog.tsx           # Export options
│   ├── LearningDashboard.tsx      # Progress tracking
│   └── NoteStatistics.tsx         # Analytics
├── hooks/
│   ├── useNoteTemplates.ts        # Template operations
│   └── useNoteExport.ts           # Export to formats
└── lib/
    ├── markdownExport.ts          # ProseMirror → Markdown
    └── pdfExport.ts               # HTML → PDF (html2pdf)
```

#### Deliverables

- ✅ Note templates for common use cases
- ✅ Export to Markdown and PDF
- ✅ Learning progress dashboard
- ✅ Note statistics and analytics
- ✅ Archive/unarchive notes

---

### Phase 8: Polish & Testing (Week 8)

**Status:** ⬜ Not Started

#### Tasks

- [ ] Write unit tests for repositories
- [ ] Write integration tests for sync
- [ ] Add E2E tests for critical workflows
- [ ] Performance optimization (lazy loading, virtualization)
- [ ] Accessibility audit (keyboard navigation, screen readers)
- [ ] User documentation
- [ ] Mobile responsiveness testing

#### Deliverables

- ✅ >80% test coverage for notes package
- ✅ E2E tests for create/edit/sync workflows
- ✅ Performance benchmarks met
- ✅ WCAG 2.1 AA compliance
- ✅ Complete user documentation

---

## Integration with Existing Architecture

### Reuse from Calendar System

The notes system will reuse proven patterns from the calendar implementation:

1. **Outbox Pattern** - Offline operation queue (`apps/web-vite/src/outbox/`)
2. **Repository Pattern** - Firestore adapters (`apps/web-vite/src/adapters/`)
3. **Sync Worker** - Background sync (`apps/web-vite/src/lib/`)
4. **IndexedDB** - Already using idb package

### Firestore Collections

```
/users/{userId}/notes/{noteId}
/users/{userId}/topics/{topicId}
/users/{userId}/sections/{sectionId}
/users/{userId}/attachments/{attachmentId}
```

### Security Rules

```javascript
// Only users can access their own notes
match /users/{userId}/notes/{noteId} {
  allow read, write: if request.auth.uid == userId;
}

// Same for topics, sections, attachments
match /users/{userId}/{collection}/{docId} {
  allow read, write: if request.auth.uid == userId;
}
```

## Dependencies to Add

### Production Dependencies

```json
{
  "@tiptap/react": "^2.6.0",
  "@tiptap/starter-kit": "^2.6.0",
  "@tiptap/extension-image": "^2.6.0",
  "@tiptap/extension-table": "^2.6.0",
  "@tiptap/extension-table-row": "^2.6.0",
  "@tiptap/extension-table-cell": "^2.6.0",
  "@tiptap/extension-table-header": "^2.6.0",
  "@tiptap/extension-mathematics": "^2.6.0",
  "@tiptap/extension-placeholder": "^2.6.0",
  "@tiptap/extension-character-count": "^2.6.0",
  "@tiptap/extension-highlight": "^2.6.0",
  "@tiptap/extension-task-list": "^2.6.0",
  "@tiptap/extension-task-item": "^2.6.0",
  "katex": "^0.16.9",
  "html2pdf.js": "^0.10.1"
}
```

### Dev Dependencies

```json
{
  "@types/katex": "^0.16.7"
}
```

## Success Metrics

### Technical Metrics

- [ ] <100ms time-to-interactive for note editor
- [ ] <500ms full-text search response time
- [ ] Offline mode works without network
- [ ] Sync completes within 5 seconds for 100 notes
- [ ] Math equations render in <50ms

### User Experience Metrics

- [ ] Can create and edit notes offline
- [ ] Auto-save prevents data loss
- [ ] Search finds relevant notes quickly
- [ ] Organization is intuitive and flexible
- [ ] Project integration enhances learning workflow

## Risks & Mitigation

### Risk: TipTap Bundle Size

- **Mitigation:** Code-split editor, lazy load extensions
- **Target:** <200KB additional bundle size

### Risk: Offline Sync Conflicts

- **Mitigation:** Version control, clear conflict UI
- **Target:** <1% of syncs result in conflicts

### Risk: Math Rendering Performance

- **Mitigation:** Virtual scrolling, lazy render equations
- **Target:** Smooth scrolling with 100+ equations

### Risk: IndexedDB Quota Limits

- **Mitigation:** Attachment size limits, quota monitoring
- **Target:** Support 1000+ notes with 50MB attachments

## Open Questions

- [ ] Should we support real-time collaborative editing (like Google Docs)?
  - **Decision:** No sharing planned (single-user scope)

- [ ] Should we support handwriting/drawing (canvas)?
  - **Decision:** Not in MVP, revisit after Phase 8

- [ ] Should we integrate with external note-taking apps (Notion, Obsidian)?
  - **Decision:** Export only initially, import later

- [ ] Should we support version control (Git-like)?
  - **Decision:** Simple version history (last 10), not full Git

## Next Steps

1. **Review and Approve Plan** - Get stakeholder buy-in
2. **Set Up Notes Package** - Create `packages/notes` structure
3. **Start Phase 1** - Data models and repositories
4. **Weekly Check-ins** - Track progress and adjust timeline

---

**Plan Created By:** Claude Code (Anthropic)
**Last Updated:** 2025-12-25
**Version:** 1.0
**Review Status:** Ready for approval
