# Code Review: Phase 1-3 Implementation Gaps

Generated: 2026-01-08

## 🔍 Executive Summary

Overall, the implementations are solid and follow existing patterns. However, several gaps and potential issues were identified that should be addressed before production deployment.

---

## ✅ What's Working Well

1. **OKR Linker Integration**: Clean integration with `useTodoOperations` hook
2. **Event Service CRUD**: Proper handling of recurring events and outbox integration
3. **Conflict Resolution UI**: Good field-level merge interface
4. **Daily Calendar View**: Solid timeline implementation with proper event positioning
5. **Google Calendar Sync**: Comprehensive error handling and rate limiting
6. **Notification System**: Real-time listener with proper toast integration

---

## 🚨 Critical Gaps

### 1. **Event Service - Missing `calendarId` Field**

**Files:**

- `apps/web-vite/src/hooks/useEventService.ts:93-126`
- `apps/web-vite/src/hooks/useEventOperations.ts:108-142`

**Issue:** Both `createEvent` implementations don't set `calendarId` field, which is required for calendar permission lookups and color mapping.

**Impact:**

- Events won't have proper calendar association
- Color coding in views may fail
- Permission checks may not work correctly

**Fix Required:**

```typescript
// In createEvent, add:
calendarId: metadata?.calendarId || 'local:primary', // Or get from user's default calendar
```

**Priority:** HIGH

---

### 2. **Event Service - Missing `rev` Field in Updates**

**File:** `apps/web-vite/src/hooks/useEventService.ts:230-249`

**Issue:** `updateEvent` doesn't preserve or increment the `rev` field, which is critical for conflict resolution. Note: `useEventOperations` may handle this differently - needs verification.

**Impact:**

- Conflict resolution may not work correctly
- Multi-device sync could have issues

**Fix Required:**

```typescript
const updatedEvent: CanonicalCalendarEvent = {
  ...existingEvent,
  rev: (existingEvent.rev ?? 0) + 1, // Increment revision
  // ... rest of fields
}
```

**Priority:** HIGH

---

### 3. **Notifications - Never Marked as Read**

**File:** `apps/web-vite/src/hooks/useNotifications.ts:59-104`

**Issue:** Notifications are displayed but never marked as `read: true` in Firestore. This means:

- Same notifications will be shown again on page refresh
- No way to track which notifications user has seen
- Query will always return the same unread notifications

**Impact:**

- Duplicate notifications on refresh
- No notification history/management
- Potential performance issues with growing unread count

**Fix Required:**

```typescript
// After displaying notification, mark as read
await updateDoc(doc(db, `users/${user.uid}/notifications/${notification.id}`), {
  read: true,
  readAtMs: Date.now(),
})
```

**Priority:** HIGH

---

### 4. **Conflict Resolution - No Preview Before Save**

**File:** `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx:57-88`

**Issue:** The merged note is created but there's no preview UI showing what the final merged note will look like before the user confirms.

**Impact:**

- Users can't verify the merge before committing
- Potential for unexpected merge results
- Poor UX for complex merges

**Fix Required:**

- Add a preview section showing the merged note structure
- Highlight which fields came from which version
- Allow users to review before clicking "Resolve Conflict"

**Priority:** MEDIUM

---

### 5. **Google Calendar Sync - Missing Firestore Index**

**File:** `functions/src/index.ts:524`

**Issue:** Uses `collectionGroup('calendarAccounts')` which requires a composite Firestore index.

**Impact:**

- Function will fail on first run with index error
- Deployment will require manual index creation

**Fix Required:**

- Document required Firestore index in deployment instructions
- Or add index creation logic (if possible)
- Or use alternative query pattern that doesn't require collectionGroup

**Priority:** HIGH (deployment blocker)

**Required Index:**

```
Collection Group: calendarAccounts
Fields: status (Ascending)
```

---

### 6. **Google Calendar Sync - No Timeout Protection**

**File:** `functions/src/index.ts:564-632`

**Issue:** No timeout handling for long-running syncs. If a user has many calendars or slow API responses, the function could exceed the 9-minute timeout.

**Impact:**

- Function timeout errors
- Incomplete syncs
- No retry mechanism for partial failures

**Fix Required:**

- Add per-account timeout (e.g., 2 minutes max per account)
- Track progress and allow resumption
- Consider splitting into multiple scheduled functions

**Priority:** MEDIUM

---

### 7. **Daily View - Hard-coded Height**

**File:** `apps/web-vite/src/components/DailyView.tsx:485-486`

**Issue:** Timeline uses fixed `2400px` height (24 hours \* 100px), which may not work well on all screen sizes.

**Impact:**

- Poor UX on smaller screens
- Wasted space on large screens
- No responsive design

**Fix Required:**

- Use viewport-based height calculation
- Make hour height configurable
- Add responsive breakpoints

**Priority:** LOW

---

### 8. **Daily View - No Overlapping Event Handling**

**File:** `apps/web-vite/src/components/DailyView.tsx:350-400`

**Issue:** Events that overlap in time will render on top of each other with no visual indication of overlap.

**Impact:**

- Confusing UI when events overlap
- Can't see all events clearly
- No collision detection

**Fix Required:**

- Detect overlapping events
- Stack them horizontally or use a different layout
- Add visual indicators for overlaps

**Priority:** MEDIUM

---

### 9. **OKR Linker - No Error Handling**

**File:** `apps/web-vite/src/components/notes/OKRLinker.tsx:38-43`

**Issue:** `loadData` is called without error handling. If it fails, the user sees no feedback.

**Impact:**

- Silent failures
- Poor UX when data can't load
- No retry mechanism

**Fix Required:**

```typescript
try {
  await loadData({ includeTasks: false })
  setInitialLoadDone(true)
} catch (error) {
  console.error('Failed to load OKRs:', error)
  // Show error toast or UI feedback
}
```

**Priority:** MEDIUM

---

### 10. **Conflict Resolution - Missing Validation**

**File:** `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx:57-88`

**Issue:** No validation that the merged note is valid (e.g., required fields present, valid JSON content).

**Impact:**

- Could create invalid notes
- Potential runtime errors when saving
- Data corruption risk

**Fix Required:**

- Validate merged note structure
- Check required fields
- Validate TipTap JSONContent format

**Priority:** MEDIUM

---

## ⚠️ Medium Priority Issues

### 11. **Notifications - No Cleanup**

**File:** `apps/web-vite/src/hooks/useNotifications.ts`

**Issue:** Old notifications accumulate indefinitely. No cleanup mechanism for old read notifications.

**Fix Required:**

- Add cleanup function to delete notifications older than 30 days
- Or archive old notifications
- Run cleanup periodically or on notification read

**Priority:** MEDIUM

---

### 12. **Google Calendar Sync - No Progress Tracking**

**File:** `functions/src/index.ts:519-640`

**Issue:** No way to track sync progress or see which accounts are being processed.

**Fix Required:**

- Add progress document in Firestore
- Update progress as each account is processed
- Allow UI to display sync status

**Priority:** LOW

---

### 13. **Daily View - Missing Loading State**

**File:** `apps/web-vite/src/components/DailyView.tsx`

**Issue:** No loading indicator while events are being fetched.

**Fix Required:**

- Add loading prop
- Show skeleton or spinner while loading
- Handle empty state better

**Priority:** LOW

---

### 14. **Event Service - No Input Validation**

**File:** `apps/web-vite/src/hooks/useEventService.ts`

**Issue:** No validation of `eventId` format or `EventFormData` before processing.

**Fix Required:**

- Validate eventId is not empty
- Validate form data structure
- Check date ranges are valid

**Priority:** LOW

---

## 📝 Code Quality Issues

### 15. **Type Safety - Missing Type Guards**

**File:** `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx:72-84`

**Issue:** Type assertions (`as any`, `as string[]`) without proper type guards.

**Fix Required:**

- Add proper type guards
- Validate types at runtime
- Use TypeScript narrowing

**Priority:** LOW

---

### 16. **Error Messages - Not User-Friendly**

**File:** Multiple files

**Issue:** Error messages are technical and not user-friendly.

**Fix Required:**

- Add user-friendly error messages
- Provide actionable guidance
- Use toast notifications with helpful text

**Priority:** LOW

---

## 🔧 Missing Features

### 17. **Notification Center UI**

**Issue:** No UI to view all notifications, mark as read, or manage notification preferences.

**Fix Required:**

- Create notification center component
- Add to TopNav or Settings
- Allow bulk actions (mark all as read, delete)

**Priority:** LOW (nice to have)

---

### 18. **Conflict Resolution - No Undo**

**Issue:** Once conflict is resolved, there's no way to undo the resolution.

**Fix Required:**

- Store conflict history
- Add undo functionality
- Allow re-opening resolved conflicts

**Priority:** LOW (nice to have)

---

## 📊 Performance Concerns

### 19. **Daily View - No Virtualization**

**File:** `apps/web-vite/src/components/DailyView.tsx`

**Issue:** All events are rendered even if only a few are visible. For days with many events, this could be slow.

**Fix Required:**

- Implement virtual scrolling
- Only render visible events
- Use intersection observer

**Priority:** LOW (optimize later)

---

### 20. **Google Calendar Sync - No Batching**

**File:** `functions/src/index.ts:564-632`

**Issue:** Processes all users sequentially. For large user bases, this could take too long.

**Fix Required:**

- Process in smaller batches
- Use Cloud Tasks for async processing
- Distribute across multiple function invocations

**Priority:** LOW (scale when needed)

---

## 🎯 Recommended Action Plan

### Immediate (Before Deployment)

1. ✅ Fix `calendarId` in `createEvent`
2. ✅ Fix `rev` field in `updateEvent`
3. ✅ Mark notifications as read after display
4. ✅ Document/create Firestore index for `collectionGroup`
5. ✅ Add error handling to OKR Linker

### Short Term (Next Sprint)

6. ✅ Add preview to conflict resolution
7. ✅ Add timeout protection to Google Calendar sync
8. ✅ Handle overlapping events in Daily View
9. ✅ Add validation to conflict resolution merge

### Long Term (Future Enhancements)

10. ✅ Notification center UI
11. ✅ Virtualization for Daily View
12. ✅ Progress tracking for sync operations
13. ✅ Notification cleanup mechanism

---

## 📋 Testing Checklist

- [ ] Test OKR Linker with empty projects/chapters
- [ ] Test Event Service with missing eventId
- [ ] Test Conflict Resolution with all field types
- [ ] Test Daily View with 0, 1, and many events
- [ ] Test Google Calendar sync with 0, 1, and many users
- [ ] Test notifications with multiple quota alerts
- [ ] Test error scenarios (network failures, invalid data)
- [ ] Test edge cases (very long content, special characters)

---

## 🔗 Related Files

- `apps/web-vite/src/components/notes/OKRLinker.tsx`
- `apps/web-vite/src/hooks/useEventService.ts`
- `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx`
- `apps/web-vite/src/components/DailyView.tsx`
- `functions/src/index.ts` (scheduleSync)
- `functions/src/agents/runExecutor.ts`
- `apps/web-vite/src/hooks/useNotifications.ts`
- `apps/web-vite/src/App.tsx`
