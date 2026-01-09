# Implementation Plan: Code Review Fixes

Generated: 2026-01-08

## 📋 Overview

This plan addresses 20 gaps and issues identified in the Phase 1-3 code review. Fixes are organized by priority and grouped for efficient implementation.

**Total Estimated Effort:** ~16-20 hours

- Critical: ~6-8 hours
- Medium: ~6-8 hours
- Low: ~4-4 hours

---

## 🚨 Phase 1: Critical Fixes (Before Deployment)

**Estimated Time:** 6-8 hours  
**Priority:** Must fix before production deployment

### 1.1 Fix Missing `calendarId` in Event Creation

**Files to Modify:**

- `apps/web-vite/src/hooks/useEventService.ts`
- `apps/web-vite/src/hooks/useEventOperations.ts`

**Steps:**

1. Determine default calendar logic:
   - Check if user has a default calendar preference
   - Fallback to `local:primary` for local events
   - For Google Calendar events, use the account's primary calendar ID

2. Update `useEventService.createEvent`:

   ```typescript
   // Add after line 90
   const defaultCalendarId = metadata?.calendarId || await getDefaultCalendarId(userId) || 'local:primary'

   // Add to newEvent object (line 93)
   calendarId: defaultCalendarId,
   ```

3. Update `useEventOperations.createEvent`:

   ```typescript
   // Add after line 101
   const defaultCalendarId = metadata?.calendarId || await getDefaultCalendarId(userId) || 'local:primary'

   // Add to newEvent object (line 108)
   calendarId: defaultCalendarId,
   ```

4. Create helper function `getDefaultCalendarId`:
   - Query user's calendars for primary/default
   - Cache result to avoid repeated queries
   - Return `local:primary` if no calendars found

5. **Testing:**
   - Create local event → verify `calendarId` is set
   - Create event with metadata → verify metadata `calendarId` is used
   - Create event without calendars → verify fallback works

**Estimated Time:** 2-3 hours

---

### 1.2 Mark Notifications as Read After Display

**Files to Modify:**

- `apps/web-vite/src/hooks/useNotifications.ts`

**Steps:**

1. Import Firestore update function:

   ```typescript
   import { updateDoc, doc } from 'firebase/firestore'
   ```

2. After displaying notification (line 60-104), mark as read:

   ```typescript
   // After toast display, mark as read
   try {
     await updateDoc(doc(db, `users/${user.uid}/notifications/${notification.id}`), {
       read: true,
       readAtMs: Date.now(),
     })
   } catch (error) {
     console.error('Failed to mark notification as read:', error)
     // Don't block notification display on read failure
   }
   ```

3. Update query to exclude read notifications (already done, but verify):
   - Current query filters `where('read', '==', false)` ✓

4. **Testing:**
   - Display notification → verify it's marked as read in Firestore
   - Refresh page → verify notification doesn't appear again
   - Multiple notifications → verify all are marked as read

**Estimated Time:** 1 hour

---

### 1.3 Firestore Index for Google Calendar Sync

**Files to Create/Modify:**

- `firestore.indexes.json` (create if doesn't exist)
- `firebase.json` (update if needed)

**Steps:**

1. Check if `firestore.indexes.json` exists:

   ```bash
   ls firestore.indexes.json
   ```

2. Note: Firestore already provides single-field indexes by default. The manual
   `calendarAccounts/status` single-field index is not necessary and should not
   be listed in `firestore.indexes.json`. If a single-field override is needed,
   configure it via `fieldOverrides` or the Firebase console.

3. Update `firebase.json` to include indexes:

   ```json
   {
     "firestore": {
       "rules": "firestore.rules",
       "indexes": "firestore.indexes.json"
     }
   }
   ```

4. Deploy index:

   ```bash
   firebase deploy --only firestore:indexes
   ```

5. **Alternative:** If index deployment is not possible immediately:
   - Modify query to use collection path instead of collectionGroup
   - Requires iterating through all users (less efficient but works)

6. **Testing:**
   - Run scheduled sync function
   - Verify no index errors in logs
   - Verify sync completes successfully

**Estimated Time:** 1-2 hours (including deployment)

---

### 1.4 Verify/Fix `rev` Field Handling

**Files to Review:**

- `apps/web-vite/src/hooks/useEventService.ts`
- `apps/web-vite/src/hooks/useEventOperations.ts`
- `apps/web-vite/src/adapters/firestoreCalendarEventRepository.ts`

**Steps:**

1. Review `updateEventWithConflictResolution`:
   - Verify it handles `rev` increment correctly
   - Check if `rev` is required in input or auto-incremented

2. Review `useEventService.updateEvent`:
   - Check if `rev` is preserved from existing event
   - Verify it's incremented in repository layer

3. If `rev` is not handled:

   ```typescript
   // In useEventService.updateEvent, line 230
   const updatedEvent: CanonicalCalendarEvent = {
     ...existingEvent,
     rev: (existingEvent.rev ?? 0) + 1, // Increment revision
     // ... rest
   }
   ```

4. **Testing:**
   - Update event → verify `rev` increments
   - Concurrent updates → verify conflict resolution works
   - Check Firestore → verify `rev` field exists and increments

**Estimated Time:** 1-2 hours

---

### 1.5 Add Error Handling to OKR Linker

**Files to Modify:**

- `apps/web-vite/src/components/notes/OKRLinker.tsx`

**Steps:**

1. Add error state:

   ```typescript
   const [loadError, setLoadError] = useState<Error | null>(null)
   ```

2. Wrap `loadData` in try-catch:

   ```typescript
   useEffect(() => {
     if (isOpen && !initialLoadDone && userId) {
       const loadOKRs = async () => {
         try {
           setLoadError(null)
           await loadData({ includeTasks: false })
           setInitialLoadDone(true)
         } catch (error) {
           console.error('Failed to load OKRs:', error)
           setLoadError(error instanceof Error ? error : new Error('Failed to load OKRs'))
           // Show user-friendly error
           toast.error('Failed to load projects and milestones', {
             description: 'Please try again or refresh the page',
           })
         }
       }
       void loadOKRs()
     }
   }, [isOpen, initialLoadDone, userId, loadData])
   ```

3. Add retry button in UI if error occurs:

   ```typescript
   {loadError && (
     <div className="error-message">
       <p>Failed to load OKRs</p>
       <button onClick={() => { setInitialLoadDone(false); setLoadError(null) }}>
         Retry
       </button>
     </div>
   )}
   ```

4. **Testing:**
   - Simulate network failure → verify error handling
   - Test retry functionality
   - Verify error doesn't break component

**Estimated Time:** 1 hour

---

## ⚠️ Phase 2: Medium Priority Fixes (Next Sprint)

**Estimated Time:** 6-8 hours  
**Priority:** Important for production quality

### 2.1 Add Preview to Conflict Resolution

**Files to Modify:**

- `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx`

**Steps:**

1. Add preview section in modal:

   ```typescript
   {selectedVersion === 'merge' && createMergedNote && (
     <div className="merge-preview">
       <h3>Preview of Merged Note</h3>
       <div className="preview-content">
         <p><strong>Title:</strong> {createMergedNote.title}</p>
         <p><strong>Projects:</strong> {createMergedNote.projectIds?.join(', ') || 'None'}</p>
         <p><strong>OKRs:</strong> {createMergedNote.okrIds?.join(', ') || 'None'}</p>
         <p><strong>Tags:</strong> {createMergedNote.tags?.join(', ') || 'None'}</p>
         <div className="content-preview">
           <strong>Content Preview:</strong>
           <div dangerouslySetInnerHTML={{ __html: createMergedNote.contentHtml || '' }} />
         </div>
       </div>
     </div>
   )}
   ```

2. Add field source indicators:
   - Show which version each field came from
   - Use color coding (blue for local, green for remote)

3. **Testing:**
   - Test merge preview with various field combinations
   - Verify preview updates when field selections change
   - Test with long content (truncate if needed)

**Estimated Time:** 2-3 hours

---

### 2.2 Add Timeout Protection to Google Calendar Sync

**Files to Modify:**

- `functions/src/index.ts` (scheduleSync function)

**Steps:**

1. Add per-account timeout:

   ```typescript
   const ACCOUNT_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes per account

   // Wrap sync in timeout
   const syncWithTimeout = (uid: string, accountId: string) => {
     return Promise.race([
       syncAllCalendarsIncremental(uid, accountId),
       new Promise((_, reject) =>
         setTimeout(() => reject(new Error('Sync timeout')), ACCOUNT_TIMEOUT_MS)
       ),
     ])
   }
   ```

2. Track progress for resumption:
   - Store sync state in Firestore
   - Allow function to resume from last processed account
   - Or split into multiple scheduled functions

3. Add timeout handling:

   ```typescript
   try {
     await syncWithTimeout(uid, accountId)
   } catch (error) {
     if (error.message === 'Sync timeout') {
       console.warn(`Sync timeout for ${uid}/${accountId}, marking for retry`)
       // Mark account for retry in next run
       await accountRef(uid, accountId).set(
         {
           lastSyncAttempt: new Date().toISOString(),
           syncStatus: 'timeout',
         },
         { merge: true }
       )
     }
   }
   ```

4. **Testing:**
   - Test with account that has many calendars
   - Verify timeout triggers correctly
   - Verify retry mechanism works

**Estimated Time:** 2-3 hours

---

### 2.3 Handle Overlapping Events in Daily View

**Files to Modify:**

- `apps/web-vite/src/components/DailyView.tsx`

**Steps:**

1. Create overlap detection function:

   ```typescript
   function detectOverlaps(events: CanonicalCalendarEvent[]): Map<string, number[]> {
     const overlaps = new Map<string, number[]>()
     // Sort events by start time
     const sorted = [...events].sort((a, b) => a.startMs - b.startMs)

     for (let i = 0; i < sorted.length; i++) {
       const overlapping: number[] = []
       for (let j = i + 1; j < sorted.length; j++) {
         if (sorted[j].startMs < sorted[i].endMs) {
           overlapping.push(j)
         } else {
           break
         }
       }
       if (overlapping.length > 0) {
         overlaps.set(
           sorted[i].canonicalEventId,
           overlapping.map((idx) => sorted[idx].canonicalEventId)
         )
       }
     }
     return overlaps
   }
   ```

2. Calculate horizontal offset for overlapping events:

   ```typescript
   function calculateEventLayout(
     events: CanonicalCalendarEvent[]
   ): Map<string, { left: number; width: number }> {
     const layout = new Map()
     const overlaps = detectOverlaps(events)
     // Calculate columns and positions
     // ... implementation
     return layout
   }
   ```

3. Update event rendering to use layout:

   ```typescript
   const eventLayout = calculateEventLayout(dayEvents)
   // Apply left and width styles based on layout
   ```

4. **Testing:**
   - Test with 0, 1, 2, 3+ overlapping events
   - Verify events don't overlap visually
   - Test with events of different durations

**Estimated Time:** 3-4 hours

---

### 2.4 Add Validation to Conflict Resolution Merge

**Files to Modify:**

- `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx`

**Steps:**

1. Create validation function:

   ```typescript
   function validateMergedNote(note: Note): { valid: boolean; errors: string[] } {
     const errors: string[] = []

     if (!note.title || note.title.trim().length === 0) {
       errors.push('Title is required')
     }

     if (note.content && typeof note.content === 'object') {
       // Validate TipTap JSONContent structure
       if (!note.content.type) {
         errors.push('Content must have a valid structure')
       }
     }

     // Validate noteId format
     if (!note.noteId || !note.noteId.startsWith('note:')) {
       errors.push('Invalid note ID format')
     }

     return { valid: errors.length === 0, errors }
   }
   ```

2. Add validation before resolving:

   ```typescript
   const handleResolve = () => {
     if (selectedVersion === 'merge' && createMergedNote) {
       const validation = validateMergedNote(createMergedNote)
       if (!validation.valid) {
         toast.error('Invalid merged note', {
           description: validation.errors.join(', '),
         })
         return
       }
       onResolve('merge', createMergedNote)
     } else {
       onResolve(selectedVersion)
     }
   }
   ```

3. Show validation errors in UI:

   ```typescript
   {validationErrors.length > 0 && (
     <div className="validation-errors">
       {validationErrors.map((error, idx) => (
         <p key={idx} className="error">{error}</p>
       ))}
     </div>
   )}
   ```

4. **Testing:**
   - Test with invalid title
   - Test with malformed content
   - Test with missing required fields

**Estimated Time:** 1-2 hours

---

## 📝 Phase 3: Low Priority / Nice-to-Have

**Estimated Time:** 4-6 hours  
**Priority:** Enhancements for better UX

### 3.1 Make Daily View Responsive

**Files to Modify:**

- `apps/web-vite/src/components/DailyView.tsx`

**Steps:**

1. Replace fixed height with viewport-based calculation:

   ```typescript
   const timelineHeight = useMemo(() => {
     const viewportHeight = window.innerHeight
     const headerHeight = 100 // Approximate header height
     const padding = 40
     return Math.max(600, viewportHeight - headerHeight - padding)
   }, [])
   ```

2. Make hour height configurable:

   ```typescript
   const hourHeight = timelineHeight / 24 // Dynamic based on available space
   ```

3. Add responsive breakpoints:

   ```typescript
   const isMobile = window.innerWidth < 768
   const hourHeight = isMobile ? 40 : 100
   ```

4. **Testing:**
   - Test on mobile, tablet, desktop
   - Verify timeline scales correctly
   - Test with different viewport sizes

**Estimated Time:** 1-2 hours

---

### 3.2 Add Loading States

**Files to Modify:**

- `apps/web-vite/src/components/DailyView.tsx`

**Steps:**

1. Add loading prop:

   ```typescript
   interface DailyViewProps {
     // ... existing props
     loading?: boolean
   }
   ```

2. Show skeleton while loading:

   ```typescript
   {loading ? (
     <div className="timeline-skeleton">
       {Array.from({ length: 24 }).map((_, i) => (
         <div key={i} className="hour-skeleton" />
       ))}
     </div>
   ) : (
     // ... existing timeline
   )}
   ```

3. **Testing:**
   - Test loading state display
   - Test transition from loading to loaded
   - Verify no layout shift

**Estimated Time:** 1 hour

---

### 3.3 Add Notification Cleanup

**Files to Modify:**

- `apps/web-vite/src/hooks/useNotifications.ts`
- Create: `apps/web-vite/src/utils/notificationCleanup.ts`

**Steps:**

1. Create cleanup function:

   ```typescript
   export async function cleanupOldNotifications(userId: string): Promise<void> {
     const db = await getDb()
     const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

     const notificationsRef = collection(db, `users/${userId}/notifications`)
     const q = query(
       notificationsRef,
       where('read', '==', true),
       where('createdAtMs', '<', thirtyDaysAgo)
     )

     const snapshot = await getDocs(q)
     const batch = writeBatch(db)
     snapshot.docs.forEach((doc) => {
       batch.delete(doc.ref)
     })
     await batch.commit()
   }
   ```

2. Call cleanup periodically:

   ```typescript
   // In useNotifications hook
   useEffect(() => {
     // Run cleanup once per day
     const cleanupInterval = setInterval(
       () => {
         if (user?.uid) {
           void cleanupOldNotifications(user.uid)
         }
       },
       24 * 60 * 60 * 1000
     )

     return () => clearInterval(cleanupInterval)
   }, [user?.uid])
   ```

3. **Testing:**
   - Create old read notifications
   - Run cleanup
   - Verify old notifications are deleted

**Estimated Time:** 1-2 hours

---

### 3.4 Improve Error Messages

**Files to Modify:**

- Multiple files (create error message utility)

**Steps:**

1. Create error message utility:

   ```typescript
   // apps/web-vite/src/utils/errorMessages.ts
   export function getUserFriendlyError(error: Error | string): {
     title: string
     description: string
   } {
     const message = typeof error === 'string' ? error : error.message

     if (message.includes('network') || message.includes('fetch')) {
       return {
         title: 'Connection Error',
         description: 'Please check your internet connection and try again.',
       }
     }

     if (message.includes('permission') || message.includes('unauthorized')) {
       return {
         title: 'Permission Denied',
         description: "You don't have permission to perform this action.",
       }
     }

     // ... more mappings

     return {
       title: 'Something went wrong',
       description: 'Please try again. If the problem persists, contact support.',
     }
   }
   ```

2. Update toast calls to use utility:

   ```typescript
   const friendlyError = getUserFriendlyError(error)
   toast.error(friendlyError.title, {
     description: friendlyError.description,
   })
   ```

3. **Testing:**
   - Test various error scenarios
   - Verify user-friendly messages appear
   - Test fallback for unknown errors

**Estimated Time:** 2-3 hours

---

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test `getDefaultCalendarId` helper function
- [ ] Test notification read marking
- [ ] Test overlap detection algorithm
- [ ] Test merge validation function
- [ ] Test error message utility

### Integration Tests

- [ ] Test event creation with calendarId
- [ ] Test notification flow end-to-end
- [ ] Test conflict resolution with preview
- [ ] Test Google Calendar sync with timeout
- [ ] Test Daily View with overlapping events

### Manual Testing Checklist

- [ ] Create local event → verify calendarId
- [ ] Receive quota alert → verify marked as read
- [ ] Run scheduled sync → verify no index errors
- [ ] Resolve conflict → verify preview works
- [ ] View daily calendar → verify overlapping events display correctly
- [ ] Test on mobile → verify responsive design

---

## 📅 Implementation Timeline

### Week 1: Critical Fixes

- **Day 1-2:** Fix calendarId and rev field issues
- **Day 3:** Fix notification read marking
- **Day 4:** Create and deploy Firestore index
- **Day 5:** Add error handling to OKR Linker + testing

### Week 2: Medium Priority

- **Day 1-2:** Add conflict resolution preview
- **Day 3:** Add timeout protection to sync
- **Day 4-5:** Handle overlapping events in Daily View
- **Day 5:** Add validation to conflict resolution

### Week 3: Low Priority (Optional)

- **Day 1:** Make Daily View responsive
- **Day 2:** Add loading states
- **Day 3:** Add notification cleanup
- **Day 4:** Improve error messages
- **Day 5:** Final testing and polish

---

## 🔄 Dependencies

### Before Starting

- [ ] Review existing calendar ID logic in codebase
- [ ] Check Firestore index deployment process
- [ ] Verify conflict resolution repository implementation
- [ ] Review notification data structure

### External Dependencies

- Firebase Console access for index deployment
- Test accounts with various calendar configurations
- Network simulation tools for error testing

---

## 📝 Notes

1. **calendarId Default Logic:** May need to query user's calendars to determine default. Consider caching result.

2. **Firestore Index:** If deployment is not possible immediately, consider alternative query pattern (less efficient but works).

3. **Overlap Detection:** Algorithm complexity should be O(n²) for small event counts. Optimize if needed for large datasets.

4. **Notification Cleanup:** Consider running as a scheduled Cloud Function instead of client-side for better reliability.

5. **Error Messages:** Create comprehensive mapping of error codes/messages to user-friendly text. Consider i18n if needed.

---

## ✅ Definition of Done

Each fix is considered complete when:

- [ ] Code changes implemented
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] Manual testing completed
- [ ] Code reviewed
- [ ] Documentation updated (if needed)
- [ ] No new linter errors
- [ ] TypeScript compilation passes

---

## 🚀 Deployment Checklist

Before deploying fixes:

- [ ] All critical fixes completed
- [ ] Firestore index deployed
- [ ] All tests passing
- [ ] Manual testing completed
- [ ] Code review approved
- [ ] Rollback plan documented
- [ ] Monitoring/alerting configured
