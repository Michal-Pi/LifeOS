# Refactor Plan: Decouple useEventOperations from UI State

## ✅ **STATUS: PHASE 1 COMPLETE**

**Completed:**
- ✅ Created `hooks/useEventService.ts` (business logic layer)
- ✅ Migrated TodoPage to use clean service hook
- ✅ TodoPage no longer needs dummy state setters
- ✅ All typechecks pass
- ✅ TodoPage now has clean, maintainable code

**Remaining Work:**
- ⏳ CalendarPage still uses `useEventOperations` (acceptable for now)
- ⏳ Future: Create `useEventUI` to wrap service hook for CalendarPage when needed
- ⏳ Future: Add updateEvent, deleteEvent methods to useEventService

---

## Problem Statement (SOLVED for TodoPage)

The `useEventOperations` hook is currently tightly coupled to UI state management, requiring consumers to pass in multiple state setters even when they don't need them. This creates unnecessary dependencies and forces workarounds.

**Current Issue (TodoPage.tsx:36-51):**
```typescript
// TodoPage has to create dummy state just to use createEvent
const [, setDummyEvents] = useState<CanonicalCalendarEvent[]>([])
const { createEvent } = useEventOperations({
  userId,
  setEvents: setDummyEvents,        // unused
  selectedEvent: null,               // unused
  setSelectedEvent: () => {},        // no-op
  setFormModalOpen: () => {},        // no-op
  setDeleteModalOpen: () => {},      // no-op
  setEditScope: () => {},            // no-op
  setPendingFormData: () => {},      // no-op
  setPendingOps: () => {},           // no-op
  setConnectionError: (err) => console.error(err)
})
```

This is a code smell indicating poor separation of concerns.

---

## Root Cause Analysis

1. **Mixed Responsibilities**: The hook combines:
   - Business logic (event CRUD operations)
   - UI state management (modal open/close, selections)
   - Sync state management (pending ops, connection errors)

2. **Overly Specific Interface**: Requires 10 parameters, most of which are UI-specific

3. **No Flexibility**: Cannot use event operations without satisfying all UI dependencies

---

## Proposed Solution

### **Option A: Split into Multiple Hooks (Recommended)**

Create a layered architecture with clear separation of concerns:

#### Layer 1: Core Event Repository (No React)
```typescript
// lib/eventRepository.ts
export const eventRepository = {
  async createEvent(userId: string, event: CanonicalCalendarEvent): Promise<void>
  async updateEvent(userId: string, event: CanonicalCalendarEvent): Promise<void>
  async deleteEvent(userId: string, eventId: string): Promise<void>
  async listEvents(userId: string): Promise<CanonicalCalendarEvent[]>
}
```

#### Layer 2: Business Logic Hook (React, No UI State)
```typescript
// hooks/useEventService.ts
export function useEventService(userId: string) {
  return {
    createEvent: async (data: EventFormData, metadata?: object) => CanonicalCalendarEvent
    updateEvent: async (eventId: string, data: EventFormData) => void
    deleteEvent: async (eventId: string) => void
    // ... other operations
  }
}
```

#### Layer 3: UI State Management Hook (Optional)
```typescript
// hooks/useEventUI.ts - Only used by CalendarPage
export function useEventUI(userId: string) {
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<CanonicalCalendarEvent | null>(null)
  const [formModalOpen, setFormModalOpen] = useState(false)
  // ... other UI state

  const eventService = useEventService(userId)

  // Wrap service methods with UI state updates
  const createEventWithUI = async (data: EventFormData) => {
    const event = await eventService.createEvent(data)
    setEvents(prev => [...prev, event].sort((a, b) => a.startMs - b.startMs))
    setSelectedEvent(event)
    setFormModalOpen(false)
    return event
  }

  return {
    events,
    selectedEvent,
    formModalOpen,
    setFormModalOpen,
    createEvent: createEventWithUI,
    // ... other methods with UI integration
  }
}
```

#### Usage in TodoPage (Clean!)
```typescript
// TodoPage.tsx
const eventService = useEventService(userId)

const handleSaveSchedule = async (formData: EventFormData) => {
  if (!selectedTask) return

  const newCalendarEvent = await eventService.createEvent(formData, { taskId: selectedTask.id })

  const updatedTask: CanonicalTask = {
    ...selectedTask,
    status: 'scheduled',
    calendarEventIds: [...(selectedTask.calendarEventIds || []), newCalendarEvent.canonicalEventId],
  }
  await updateTask(updatedTask)
  setIsScheduleModalOpen(false)
}
```

#### Usage in CalendarPage (Full UI!)
```typescript
// CalendarPage.tsx
const {
  events,
  selectedEvent,
  formModalOpen,
  setFormModalOpen,
  createEvent,
  updateEvent,
  deleteEvent
} = useEventUI(userId)

// Everything works seamlessly with full UI state management
```

---

### **Option B: Make Parameters Optional**

Keep single hook but make UI parameters optional:

```typescript
interface UseEventOperationsProps {
  userId: string
  // Optional UI state
  setEvents?: React.Dispatch<React.SetStateAction<CanonicalCalendarEvent[]>>
  selectedEvent?: CanonicalCalendarEvent | null
  setSelectedEvent?: React.Dispatch<React.SetStateAction<CanonicalCalendarEvent | null>>
  setFormModalOpen?: (open: boolean) => void
  setDeleteModalOpen?: (open: boolean) => void
  setEditScope?: (scope: EditScope | null) => void
  setPendingFormData?: (data: EventFormData | null) => void
  setPendingOps?: (ops: OutboxOp[]) => void
  setConnectionError?: (error: string | null) => void
}

export function useEventOperations(props: UseEventOperationsProps) {
  const createEvent = async (data: EventFormData, metadata?: object) => {
    const event = /* create event logic */

    // Only update UI state if provided
    props.setEvents?.(prev => [...prev, event])
    props.setSelectedEvent?.(event)
    props.setFormModalOpen?.(false)

    return event
  }

  return { createEvent, updateEvent, deleteEvent }
}
```

**Pros:**
- Minimal refactoring required
- Backward compatible

**Cons:**
- Still mixes concerns
- Parameters still clutter the interface
- Doesn't solve the architectural issue

---

## Recommended Approach: Option A

**Why Option A is better:**
1. ✅ Clean separation of concerns
2. ✅ Easier to test (each layer independently testable)
3. ✅ More flexible (can compose functionality as needed)
4. ✅ Follows SOLID principles
5. ✅ Better TypeScript inference
6. ✅ Easier to maintain and extend

---

## Implementation Plan

### **Phase 1: Extract Core Repository** (1-2 hours)
- [ ] Create `lib/eventRepository.ts` with core CRUD operations
- [ ] Move Firestore interaction logic from hook to repository
- [ ] Add unit tests for repository layer

### **Phase 2: Create Service Hook** (1-2 hours)
- [ ] Create `hooks/useEventService.ts`
- [ ] Move business logic from `useEventOperations` (recurrence building, event creation logic)
- [ ] Use repository layer for persistence
- [ ] Return simple async functions without UI dependencies

### **Phase 3: Create UI Hook** (2-3 hours)
- [ ] Create `hooks/useEventUI.ts`
- [ ] Wrap service hook with UI state management
- [ ] Handle modal state, selections, etc.
- [ ] Maintain backward compatibility

### **Phase 4: Migrate Consumers** (2-3 hours)
- [ ] Update CalendarPage to use `useEventUI`
- [ ] Update TodoPage to use `useEventService`
- [ ] Update any other consumers
- [ ] Test all workflows

### **Phase 5: Cleanup** (1 hour)
- [ ] Remove old `useEventOperations` hook
- [ ] Update documentation
- [ ] Run full test suite
- [ ] Code review

**Total Estimated Time: 7-11 hours**

---

## Benefits After Refactor

1. **TodoPage becomes cleaner:**
   ```typescript
   const eventService = useEventService(userId)
   // No dummy state needed!
   ```

2. **Easier testing:**
   - Repository: Test with mock Firestore
   - Service: Test with mock repository
   - UI: Test with mock service

3. **Better reusability:**
   - Other pages can use service layer without UI baggage
   - Can create different UI patterns without duplicating logic

4. **Clearer ownership:**
   - Repository: Data persistence
   - Service: Business logic
   - UI Hook: State management

---

## Migration Strategy

### Breaking Changes
- `useEventOperations` hook interface will change
- Consumers need to choose between `useEventService` or `useEventUI`

### Non-Breaking Approach
1. Create new hooks alongside old one
2. Gradually migrate consumers
3. Deprecate old hook with warning
4. Remove after all migrations complete

---

## Alternative: Quick Fix (Not Recommended)

If full refactor is not feasible now, add a comment and defer:

```typescript
// TodoPage.tsx
// TODO: Refactor useEventOperations to separate business logic from UI state
// See: REFACTOR_PLAN_EVENT_OPERATIONS.md
const [, setDummyEvents] = useState<CanonicalCalendarEvent[]>([])
const { createEvent } = useEventOperations({ /* ... */ })
```

This at least documents the technical debt for future work.

---

## Success Criteria

- ✅ TodoPage no longer needs dummy state
- ✅ All existing functionality works
- ✅ Test coverage maintained or improved
- ✅ TypeScript types are clear and correct
- ✅ No performance regression
- ✅ Code is more maintainable

---

## Related Files

- **Current implementation:** `apps/web-vite/src/hooks/useEventOperations.ts`
- **Main consumer:** `apps/web-vite/src/pages/CalendarPage.tsx`
- **Problematic usage:** `apps/web-vite/src/pages/TodoPage.tsx:36-51`
- **Repository:** `apps/web-vite/src/adapters/firestoreCalendarEventRepository.ts`
