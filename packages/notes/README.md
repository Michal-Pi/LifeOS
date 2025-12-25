# @lifeos/notes

Notes domain package for LifeOS - handles rich text note-taking, organization, and learning management.

## Features

- Rich text notes with ProseMirror-based content
- Hierarchical organization: Topics → Sections → Notes
- Project and OKR associations
- Attachment support
- Offline-first with sync capabilities
- Full-text search

## Data Models

### Note
Core note document with rich content, organization, and metadata.

### Topic
Folders for organizing notes (can be nested).

### Section
Subfolders within topics for additional organization.

### Attachment
File attachments linked to notes (images, PDFs, etc.).

## Repository Pattern

The package defines repository interfaces (ports) that must be implemented by adapters:

- `NoteRepository` - Note CRUD operations
- `TopicRepository` - Topic CRUD operations
- `SectionRepository` - Section CRUD operations
- `AttachmentRepository` - Attachment CRUD and file upload

See `src/ports/` for interface definitions.

## Usage

```typescript
import {
  Note,
  Topic,
  Section,
  NoteRepository,
  TopicRepository,
  validateNote,
  validateCreateNoteInput,
} from '@lifeos/notes'
```

## Implementation Status

- ✅ Phase 1: Data models and repository interfaces
- ⬜ Phase 2: TipTap editor integration
- ⬜ Phase 3: Organization UI
- ⬜ Phase 4: Project integration
- ⬜ Phase 5: Attachments & media
- ⬜ Phase 6: Offline sync
- ⬜ Phase 7: Advanced features
- ⬜ Phase 8: Polish & testing

See `docs/features/learning-notes-plan.md` for full implementation plan.
