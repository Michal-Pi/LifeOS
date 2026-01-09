# TODOs and Placeholders in Codebase

Generated: 2026-01-08

## 🔴 Critical TODOs (Implementation Needed)

### 1. Notes Search Implementation

**File:** `apps/web-vite/src/adapters/notes/firestoreNoteRepository.ts:119`

```typescript
// TODO: Implement vectorized text search with BM25 + semantic search
// Plan: Vectorize note content, use BM25 for keyword matching and semantic search for meaning-based queries
```

**Status:** Currently using client-side filtering. Future: Vectorization + BM25 + semantic search.

### 2. OKR Linker Integration

**File:** `apps/web-vite/src/components/notes/OKRLinker.tsx:46`

```typescript
// TODO: Integrate with actual project/milestone repositories
// For now, we'll use empty arrays as placeholders
```

**Status:** OKR linker shows empty arrays. Needs integration with project/milestone repositories.

### 3. Event Service CRUD Operations

**File:** `apps/web-vite/src/hooks/useEventService.ts:127`

```typescript
// TODO: Add updateEvent, deleteEvent, etc. as needed
```

**Status:** Only `createEvent` is implemented. Missing update/delete operations.

### 4. Google Calendar Sync Scheduled Function

**File:** `functions/src/index.ts:520`

```typescript
// TODO: query users with connected accounts and iterate
```

**Status:** Scheduled function for Google Calendar sync is stubbed. Needs implementation.

### 5. In-App Notifications

**File:** `functions/src/agents/runExecutor.ts:252`

```typescript
// TODO: Future - send in-app notification
```

**Status:** Quota alerts logged but no in-app notifications sent.

## 🟡 Placeholders & Incomplete Features

### 6. Conflict Resolution - Manual Merge

**File:** `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx:194`

```typescript
Merge Manually (Coming Soon)
// Manually combine both versions (not yet implemented)
```

**Status:** UI shows option but functionality not implemented.

### 7. Daily Calendar View

**File:** `apps/web-vite/src/components/calendar/CalendarViewsContainer.tsx:7`

```typescript
// - Daily view (placeholder for now)
```

**Status:** Daily view is a placeholder component.

### 8. People Module

**File:** `apps/web-vite/src/pages/PeoplePage.tsx`

```typescript
<ModulePlaceholder
  title="People"
  description="Placeholder for the people module. Profiles, roles, and relationships land here."
/>
```

**Status:** Entire module is a placeholder.

### 9. Google Suggestions Mock

**File:** `apps/web-vite/src/hooks/useGoogleSuggestions.ts:5`

```typescript
/**
 * NOTE: This is a mock implementation. A real implementation would call a Google API.
 */
```

**Status:** Mock implementation, not connected to Google API.

### 10. Virtualized Editor Note

**File:** `apps/web-vite/src/components/editor/ux/VirtualizedEditor.tsx:18`

```typescript
/**
 * Note: Full virtualization with ProseMirror is complex because ProseMirror
 * manages its own DOM and selections. This component provides optimizations
 * that work with TipTap's architecture:
 * 1. Intersection Observer for lazy loading
 * 2. Memoization of expensive operations
 * 3. Debounced updates
 */
```

**Status:** Not fully virtualized, uses optimizations instead. Documented limitation.

## 📝 Stub Files (Test/Development Only)

### 11. Stub Repositories

- `apps/web-vite/src/adapters/syncStatusRepository.stub.ts` - Stub for testing
- `apps/web-vite/src/adapters/calendarEventRepository.stub.ts` - Stub for testing

**Status:** These are intentional stubs for development/testing, not placeholders.

## Summary

**Total TODOs:** 5 critical items
**Total Placeholders:** 5 incomplete features
**Total Stubs:** 2 (intentional for testing)

### Priority Recommendations:

1. **High Priority:**
   - OKR Linker integration (affects Notes feature completeness)
   - Event Service CRUD operations (affects Calendar functionality)

2. **Medium Priority:**
   - Notes search vectorization (performance/scalability)
   - Conflict resolution manual merge (user experience)

3. **Low Priority:**
   - Google Calendar sync scheduled function (background task)
   - In-app notifications (nice-to-have)
   - Daily calendar view (UI enhancement)
   - People module (future feature)

### Notes:

- Most "placeholder" matches in the codebase are UI input placeholders (e.g., `placeholder="Search..."`), which are intentional and not TODOs.
- The People module is intentionally a placeholder for future development.
- Stub files are for testing and should remain as-is.
