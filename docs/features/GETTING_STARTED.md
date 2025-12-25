# Getting Started with Learning/Notes Implementation

**Quick Start Guide for Phase 1**

## Current Status

✅ **Calendar System** - Complete and deployed
✅ **Build Pipeline** - All checks passing
✅ **Learning/Notes Plan** - Comprehensive 8-week plan created
⏭️ **Ready to Start** - Phase 1: Foundation

## Where to Start

### Step 1: Review the Plan (5 minutes)

Read the complete plan:
- **File:** [`docs/features/learning-notes-plan.md`](./learning-notes-plan.md)
- **Focus on:** Phase 1 tasks and deliverables

### Step 2: Create Notes Package Structure (30 minutes)

```bash
# Create the notes package directory
mkdir -p packages/notes/src/{domain,repositories}

# Create initial files
touch packages/notes/src/domain/models.ts
touch packages/notes/src/domain/validation.ts
touch packages/notes/src/repositories/noteRepository.ts
touch packages/notes/src/repositories/topicRepository.ts
touch packages/notes/src/index.ts
touch packages/notes/package.json
touch packages/notes/tsconfig.json
touch packages/notes/README.md
```

### Step 3: Set Up Package Configuration (15 minutes)

**Create `packages/notes/package.json`:**
```json
{
  "name": "@lifeos/notes",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "@lifeos/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "~5.9.3"
  }
}
```

**Create `packages/notes/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }
  ]
}
```

### Step 4: Define Data Models (1 hour)

**Edit `packages/notes/src/domain/models.ts`:**

Start with the core interfaces from the plan:
- `Note` interface
- `Topic` interface
- `Section` interface
- `Attachment` interface

Reference the detailed models in the plan document.

### Step 5: Create Repository Interfaces (30 minutes)

**Edit `packages/notes/src/repositories/noteRepository.ts`:**

Define the abstract repository interface following the pattern from calendar:
```typescript
export interface NoteRepository {
  create(userId: string, note: Note): Promise<void>
  update(userId: string, note: Note): Promise<void>
  delete(userId: string, noteId: string): Promise<void>
  get(userId: string, noteId: string): Promise<Note | null>
  list(userId: string, filters?: NoteFilters): Promise<Note[]>
}
```

### Step 6: Add to Workspace (5 minutes)

**Update `pnpm-workspace.yaml`:**
```yaml
packages:
  - 'packages/*'  # Should already include notes
  - 'apps/*'
```

Run `pnpm install` to link the new package.

### Step 7: Verify Setup (5 minutes)

```bash
# From project root
pnpm --filter @lifeos/notes typecheck
pnpm --filter @lifeos/notes lint
```

Both should pass (even with minimal code).

## Phase 1 Checklist

Track your progress on Phase 1:

- [ ] Notes package created and configured
- [ ] Data models defined (Note, Topic, Section, Attachment)
- [ ] Repository interfaces created
- [ ] Firestore adapters implemented
- [ ] IndexedDB schema designed
- [ ] IndexedDB repository implemented
- [ ] Basic offline sync queue pattern
- [ ] TipTap dependencies added
- [ ] KaTeX dependencies added
- [ ] All typechecks passing
- [ ] Phase 1 complete - ready for Phase 2!

## Recommended Order of Implementation

1. **Data Models First** - Get TypeScript interfaces right
2. **Repository Interfaces** - Define the contracts
3. **Firestore Adapters** - Implement cloud persistence
4. **IndexedDB Setup** - Add offline storage
5. **Sync Queue** - Reuse outbox pattern from calendar
6. **Dependencies** - Add TipTap and KaTeX

## Helpful Resources

### Internal References
- **Calendar Package:** `packages/calendar/` - Similar patterns
- **Outbox Pattern:** `apps/web-vite/src/outbox/` - Reuse for notes
- **Firestore Adapters:** `apps/web-vite/src/adapters/` - Follow same pattern

### External Documentation
- **TipTap Docs:** https://tiptap.dev/docs/editor/introduction
- **KaTeX Docs:** https://katex.org/docs/api.html
- **ProseMirror:** https://prosemirror.net/docs/
- **IndexedDB:** https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

## Questions or Issues?

As you implement, update the plan document with:
- Decisions made
- Issues encountered
- Deviations from original plan
- Completion status of each task

Mark tasks complete in the plan document checkboxes as you finish them!

---

**Ready to build?** Start with Phase 1, Task 1: Set up data models! 🚀
