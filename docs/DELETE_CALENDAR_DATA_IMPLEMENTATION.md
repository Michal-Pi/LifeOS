# Delete All Calendar Data Implementation

## Overview

This implementation provides users with flexible control over deleting calendar data and managing linked dependencies. It addresses the issue where calendars can be deleted but events remain orphaned, and gives users options for calendar migration scenarios.

## Features Implemented

### 1. Bulk Delete All Calendar Data (Settings Feature)

**Location**: [CalendarSettingsPanel.tsx](../apps/web-vite/src/components/CalendarSettingsPanel.tsx) → [DeleteAllCalendarDataSection.tsx](../apps/web-vite/src/components/DeleteAllCalendarDataSection.tsx)

**User Options**:

- **Task Handling** (3 choices):
  - `unlink` (DEFAULT): Remove calendar links from tasks, keep the tasks
    - Use case: Calendar migration - preserves task associations for rescheduling
  - `delete-linked`: Delete tasks that have calendar links
    - Use case: Complete reset - tasks were only for calendar events
  - `keep-orphaned`: Keep calendar links as-is (may become orphaned)
    - Use case: Advanced - re-importing events from backup

- **Composite Event Handling** (2 choices):
  - `delete` (DEFAULT): Delete all composite events
    - Recommended: Composites are calendar-specific deduplication
  - `keep-orphaned`: Keep composites with invalid references
    - Use case: Advanced - preserving deduplication mapping

- **Habit Check-ins**:
  - Optional: Delete check-ins triggered by calendar events
  - Default: Keep (they degrade gracefully with orphaned sourceId)

- **Sync Data**:
  - Optional: Clear all sync history and cache
  - Default: Clear (checked) - recommended for clean slate

**Backend Endpoints**:

1. `POST /previewDeleteCalendarData`
   - Returns counts of items that will be affected
   - Used to show preview before confirmation

2. `POST /deleteAllCalendarData`
   - Executes deletion with user-specified options
   - Handles all dependencies and linked data
   - Returns detailed counts of deleted/updated items

**What Gets Deleted**:

1. Task references (based on user choice)
2. Habit check-ins with `sourceType === 'calendar'` (optional)
3. Composite events (based on user choice)
4. All calendar events
5. All calendars
6. Supporting collections (if clearSyncData):
   - calendarAccounts
   - calendarSyncState
   - calendarSyncRuns
   - calendarWritebackQueue
   - recurrenceInstanceMap
   - compositeRuns
   - freeBusyCache

**Client-side Cleanup**:

- Clears IndexedDB outbox queue (`lifeos-outbox`)
- Clears localStorage calendar-related keys
- Reloads page to refresh UI

---

### 2. Orphaned Data Cleanup Utility

**Location**: [CalendarSettingsPanel.tsx](../apps/web-vite/src/components/CalendarSettingsPanel.tsx) → [CleanupOrphanedDataSection.tsx](../apps/web-vite/src/components/CleanupOrphanedDataSection.tsx)

**Purpose**: Fix existing orphaned references without deleting calendar data

**Features**:

- **Scan**: Identifies tasks and composites with references to deleted events
- **Preview**: Shows list of affected items before cleanup
- **Selective Cleanup**: User chooses what to clean:
  - Remove invalid calendar links from tasks
  - Clean up broken composite events (deletes if <2 valid members remain)

**Use Cases**:

- Fixing data corruption from previous bugs
- Cleaning up after manual calendar deletions
- Periodic maintenance

---

### 3. Improved Single Event Deletion

**Location**: [useEventOperations.ts:316-426](../apps/web-vite/src/hooks/useEventOperations.ts#L316-L426)

**Bug Fix**: Previously, deleting an event did NOT clean up:

- Task references (tasks kept `calendarEventIds` pointing to deleted events)
- Composite memberships (composites had orphaned member references)

**New Behavior**:

- Automatically unlinks event from composite before deletion
- If composite would have <2 members after unlinking, deletes the composite
- Gracefully handles errors (logs warning if unlinking fails)
- Works for both recurring and non-recurring events

**Implementation**:

```typescript
// Before deleting the event:
const composites = await compositeRepository.findByCanonicalEventId(userId, eventId)
if (composites.length > 0) {
  await unlinkEvent(
    { compositeRepository, eventRepository: calendarRepository },
    { userId, compositeEventId: composites[0].id, canonicalEventId: eventId }
  )
}
// Then delete the event
```

---

## Architecture

### Backend (Cloud Functions)

**File**: [functions/src/index.ts:1051-1335](../functions/src/index.ts#L1051-L1335)

Two new endpoints:

1. **`previewDeleteCalendarData`**
   - Counts items using Firestore `.count().get()` for efficiency
   - Runs counts in parallel for performance
   - Returns preview object with counts

2. **`deleteAllCalendarData`**
   - Accepts options object with user preferences
   - Processes deletions in order:
     1. Tasks (unlink/delete/keep based on option)
     2. Habit check-ins (if requested)
     3. Composite events (delete/keep based on option)
     4. Calendar events
     5. Calendars
     6. Sync data (if requested)
   - Uses batched deletes (max 500 ops per batch)
   - Returns detailed counts for user feedback

### Frontend (React Components)

**DeleteAllCalendarDataSection.tsx**:

- Dropdown selectors for each option type
- Help text explaining each choice
- Preview/confirmation flow:
  1. User clicks "Delete All Calendar Data"
  2. Loads preview counts from backend
  3. Shows confirmation modal with impact summary
  4. User must type "DELETE ALL" to confirm
  5. Executes deletion
  6. Clears client-side cache
  7. Shows success message
  8. Reloads page

**CleanupOrphanedDataSection.tsx**:

- "Scan for Orphaned Data" button
- Displays scan results with counts
- Shows first 5 affected items as preview
- Checkboxes to choose what to clean
- Executes cleanup and rescans

### Data Relationships

**Entities with Calendar Event Dependencies**:

| Entity           | Relationship                 | Field                                       | Cleanup Strategy                                    |
| ---------------- | ---------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Tasks            | One-way reference            | `calendarEventIds: string[]`                | User choice: unlink/delete/keep                     |
| Composite Events | Bidirectional aggregation    | `members[].canonicalEventId`                | User choice: delete/keep; auto-delete if <2 members |
| Habit Check-ins  | One-way reference (optional) | `sourceId` when `sourceType === 'calendar'` | User choice: delete/keep (graceful degradation)     |

**No Dependencies**:

- Projects
- Milestones
- Notes
- Habits (only check-ins have indirect link)

---

## User Scenarios

### Scenario 1: Calendar Migration

**Goal**: Switch from Google Calendar to new calendar but keep task scheduling

**Steps**:

1. Go to Settings → Calendar Accounts
2. Click "Delete All Calendar Data"
3. Select:
   - Tasks: "Remove calendar links from tasks (keep tasks)" ✅
   - Composites: "Delete all composites" ✅
   - Habit check-ins: Unchecked (keep)
   - Sync data: Checked (clear)
4. Confirm deletion
5. Reconnect new calendar account
6. Re-schedule tasks on new calendar events

**Result**: Tasks preserved with clean slate for new calendar

### Scenario 2: Complete Reset

**Goal**: Start completely fresh, delete everything calendar-related

**Steps**:

1. Go to Settings → Calendar Accounts
2. Click "Delete All Calendar Data"
3. Select:
   - Tasks: "Delete only tasks with calendar links" ✅
   - Composites: "Delete all composites" ✅
   - Habit check-ins: Checked (delete)
   - Sync data: Checked (clear)
4. Confirm deletion

**Result**: All calendar data and linked items removed

### Scenario 3: Fix Orphaned Data

**Goal**: Clean up broken references from previous bugs/manual deletions

**Steps**:

1. Go to Settings → Calendar Accounts → Data Cleanup
2. Click "Scan for Orphaned Data"
3. Review results
4. Select cleanup options:
   - "Remove invalid calendar links from tasks" ✅
   - "Clean up broken composite events" ✅
5. Click "Clean Up Orphaned Data"

**Result**: Orphaned references removed, valid data preserved

---

## Technical Notes

### Firestore Batch Limits

- Maximum 500 operations per batch (using conservative limit)
- Batches are committed and reset when limit reached
- Large deletions may take several seconds

### Error Handling

- Authentication verified via Firebase ID token
- Graceful degradation if cache cleanup fails
- Composite unlinking errors logged but don't block deletion
- All operations wrapped in try-catch

### Performance Considerations

- Preview counts run in parallel for speed
- Batched writes for efficiency
- Client-side cache clear is async
- Page reload ensures clean UI state

### Security

- All endpoints require authenticated user
- `verifyAuth()` checks Firebase ID token
- User can only delete their own data (uid verification)
- Firestore security rules still apply

---

## Testing Checklist

### Backend Testing

- [ ] `previewDeleteCalendarData` returns accurate counts
- [ ] `deleteAllCalendarData` with `unlink` option removes task links
- [ ] `deleteAllCalendarData` with `delete-linked` option deletes tasks
- [ ] `deleteAllCalendarData` with `keep-orphaned` option preserves links
- [ ] Composite events are deleted when option is `delete`
- [ ] Composite events are preserved when option is `keep-orphaned`
- [ ] Habit check-ins are deleted when option is checked
- [ ] Sync data collections are cleared when option is checked
- [ ] Batching works correctly for large datasets (>500 items)
- [ ] Authentication is properly verified

### Frontend Testing

- [ ] Preview modal shows correct counts
- [ ] Confirmation requires "DELETE ALL" text
- [ ] Options are properly sent to backend
- [ ] Success message shows accurate counts
- [ ] Page reloads after deletion
- [ ] IndexedDB outbox is cleared
- [ ] localStorage is cleared
- [ ] Orphaned data scan works correctly
- [ ] Orphaned data cleanup updates tasks
- [ ] Orphaned data cleanup deletes invalid composites

### Integration Testing

- [ ] Single event deletion unlinks from composites
- [ ] Single event deletion doesn't break with no composite
- [ ] Recurring event deletion handles composites
- [ ] Task calendar links remain valid after normal operations
- [ ] New events don't create orphaned references

---

## Future Enhancements

### Potential Improvements

1. **Selective Calendar Deletion**: Delete specific calendars instead of all
2. **Undo/Backup**: Create backup before deletion with restore option
3. **Progress Indicator**: Show progress bar for large deletions
4. **Scheduled Cleanup**: Auto-scan for orphaned data periodically
5. **Export Before Delete**: Download calendar data as backup
6. **Bulk Task Update**: Reassign calendar events in bulk
7. **Composite Merge**: Merge composites when deleting provider calendars

### Known Limitations

1. Very large datasets (>10,000 events) may timeout - consider pagination
2. Page reload required after deletion - could use state management
3. No granular control over individual sync data collections
4. Orphaned data scan uses large date range - could be more efficient

---

## Files Modified

### Backend

- [functions/src/index.ts](../functions/src/index.ts)
  - Added `deleteAllCalendarData` endpoint (lines 1057-1275)
  - Added `previewDeleteCalendarData` endpoint (lines 1281-1335)

### Frontend Components

- [apps/web-vite/src/components/CalendarSettingsPanel.tsx](../apps/web-vite/src/components/CalendarSettingsPanel.tsx)
  - Added imports for new components (lines 7-8)
  - Added `CleanupOrphanedDataSection` (line 362)
  - Added `DeleteAllCalendarDataSection` (line 364)

### New Files Created

- [apps/web-vite/src/components/DeleteAllCalendarDataSection.tsx](../apps/web-vite/src/components/DeleteAllCalendarDataSection.tsx)
  - Main deletion UI with options and confirmation

- [apps/web-vite/src/components/CleanupOrphanedDataSection.tsx](../apps/web-vite/src/components/CleanupOrphanedDataSection.tsx)
  - Orphaned data scan and cleanup utility

### Bug Fixes

- [apps/web-vite/src/hooks/useEventOperations.ts](../apps/web-vite/src/hooks/useEventOperations.ts)
  - Added composite repository import (lines 19-20)
  - Added `unlinkEvent` import (line 20)
  - Updated `deleteEvent` function to unlink from composites (lines 316-426)
  - Handles both recurring and non-recurring event deletions

---

## Deployment Notes

### Required Steps

1. Deploy Cloud Functions:

   ```bash
   cd functions
   npm run deploy
   ```

2. No database migrations required (uses existing collections)

3. No new environment variables needed

4. Frontend builds automatically include new components

### Rollback Plan

If issues occur:

1. Revert Cloud Functions to previous version
2. Remove new component imports from CalendarSettingsPanel
3. Revert useEventOperations changes if composite unlinking causes issues

### Monitoring

Watch for:

- Increased Cloud Function execution time
- Firestore batch write errors
- Client-side cache clearing failures
- User reports of orphaned data

---

## Summary

This implementation provides comprehensive calendar data management with:

✅ **User Control**: Granular options for each type of linked data
✅ **Safe Defaults**: Recommended settings for common use cases
✅ **Preview & Confirm**: Show impact before executing
✅ **Flexible Workflows**: Support for migration, reset, and cleanup scenarios
✅ **Bug Fix**: Automatic composite unlinking on event deletion
✅ **Orphaned Data Repair**: Utility to fix existing corruption
✅ **Complete Cleanup**: All calendar data and cache properly removed

The solution directly addresses the original problem (orphaned events from deleted calendars) while providing much more flexibility for users to manage their calendar data lifecycle.
