# CalendarPage Refactoring Plan

## Overview

**Current State:** CalendarPage.tsx is 773 lines with 30+ state variables
**Goal:** Split into smaller, focused components for better maintainability and testability

## Current Issues

1. **Too many responsibilities** - Manages events, calendars, alerts, modals, sync status, and outbox
2. **State management complexity** - 30+ useState hooks in a single component
3. **Hard to test** - Monolithic structure makes unit testing difficult
4. **Performance concerns** - Unnecessary re-renders due to large component scope
5. **Hard to maintain** - Finding and updating logic requires navigating 773 lines

## Proposed Component Structure

```
CalendarPage (orchestrator)
├── CalendarHeader
│   ├── ViewSelector (daily/weekly/monthly/agenda)
│   ├── NavigationControls (prev/next month/week)
│   └── SyncStatusBanner
├── CalendarSidebar (already exists)
│   ├── Calendar list
│   ├── Add calendar button
│   └── Date picker
├── CalendarMainView
│   ├── MonthView (already exists, memoized)
│   ├── WeeklyView (already exists, memoized)
│   ├── DayView (agenda mode)
│   └── EventTimeline
├── EventModalsContainer
│   ├── EventFormModal (already exists, memoized)
│   └── DeleteConfirmModal
└── AlertsManager
    └── AlertToast components
```

## Refactoring Steps

### Phase 1: Extract Header Components (Quick Wins)

#### 1.1 Create SyncStatusBanner Component
**File:** `apps/web-vite/src/components/calendar/SyncStatusBanner.tsx`

**Props:**
```typescript
interface SyncStatusBannerProps {
  status: { lastSyncAt?: string; lastSuccessAt?: string; lastError?: string } | null
  syncing: boolean
  connectionError: string | null
  onRetrySync: () => void
}
```

**Extracted State:**
- `status`
- `syncing`
- `connectionError`

**Lines to Extract:** ~50-100

---

#### 1.2 Create CalendarHeader Component
**File:** `apps/web-vite/src/components/calendar/CalendarHeader.tsx`

**Props:**
```typescript
interface CalendarHeaderProps {
  viewType: 'daily' | 'weekly' | 'monthly' | 'agenda'
  currentMonth: number
  currentYear: number
  selectedMonthDate: Date | null
  onViewTypeChange: (view: ViewType) => void
  onNavigatePrev: () => void
  onNavigateNext: () => void
  onTodayClick: () => void
}
```

**Extracted State:**
- `viewType`
- Navigation logic

**Lines to Extract:** ~80-120

---

### Phase 2: Extract Modal Management

#### 2.1 Create EventModalsContainer Component
**File:** `apps/web-vite/src/components/calendar/EventModalsContainer.tsx`

**Purpose:** Centralize all modal state and rendering logic

**Props:**
```typescript
interface EventModalsContainerProps {
  // Form modal
  formModalOpen: boolean
  formMode: 'create' | 'edit'
  selectedEvent: CanonicalCalendarEvent | null
  editScope: EditScope | null
  onCloseFormModal: () => void
  onSaveEvent: (data: EventFormData) => void
  onScopeSelect: (scope: EditScope) => void

  // Delete modal
  deleteModalOpen: boolean
  onCloseDeleteModal: () => void
  onConfirmDelete: () => void
}
```

**Extracted State:**
- `formModalOpen`
- `formMode`
- `deleteModalOpen`
- `editScope`
- `pendingFormData`

**Lines to Extract:** ~100-150

---

### Phase 3: Extract Main View Logic

#### 3.1 Create CalendarMainView Component
**File:** `apps/web-vite/src/components/calendar/CalendarMainView.tsx`

**Purpose:** Handle view switching and event display

**Props:**
```typescript
interface CalendarMainViewProps {
  viewType: 'daily' | 'weekly' | 'monthly' | 'agenda'
  events: CanonicalCalendarEvent[]
  calendars: CanonicalCalendar[]
  selectedDate: Date | null
  currentMonth: number
  currentYear: number
  weekStartDate: Date
  onEventClick: (event: CanonicalCalendarEvent) => void
  onDateSelect: (date: Date) => void
  onCreateEvent: (date?: Date) => void
}
```

**Child Components:**
- MonthView (already exists)
- WeeklyView (already exists)
- DayView (to be created)
- EventTimeline (existing logic)

**Lines to Extract:** ~200-300

---

### Phase 4: Extract Event Operations Hook

#### 4.1 Create useCalendarState Hook
**File:** `apps/web-vite/src/hooks/useCalendarState.ts`

**Purpose:** Consolidate calendar-specific state management

**Returns:**
```typescript
interface CalendarState {
  // Events
  events: CanonicalCalendarEvent[]
  setEvents: Dispatch<SetStateAction<CanonicalCalendarEvent[]>>

  // Calendars
  calendars: CanonicalCalendar[]
  setCalendars: Dispatch<SetStateAction<CanonicalCalendar[]>>

  // Selection
  selectedEvent: CanonicalCalendarEvent | null
  setSelectedEvent: Dispatch<SetStateAction<CanonicalCalendarEvent | null>>

  // View state
  viewType: ViewType
  setViewType: Dispatch<SetStateAction<ViewType>>

  // ... other state
}
```

**Lines to Extract:** ~150-200

---

#### 4.2 Refactor useEventOperations (Already Exists)
**File:** `apps/web-vite/src/hooks/useEventOperations.ts` (410 lines)

**Needs splitting into:**
- `useEventMutations.ts` - create/update/delete
- `useEventRecurrence.ts` - recurring event operations
- `useEventRSVP.ts` - RSVP operations

---

### Phase 5: Extract Alert Management

#### 5.1 Create AlertsManager Component
**File:** `apps/web-vite/src/components/calendar/AlertsManager.tsx`

**Purpose:** Handle alert scheduling and display

**Props:**
```typescript
interface AlertsManagerProps {
  events: CanonicalCalendarEvent[]
  userId: string
}
```

**Extracted State:**
- `activeAlerts`

**Uses:** Custom hook `useEventAlerts`

**Lines to Extract:** ~100-150

---

## Implementation Order

### Recommended Sequence:

1. **Week 1: Extract UI Components (Low Risk)**
   - [ ] SyncStatusBanner (1-2 hours)
   - [ ] CalendarHeader (2-3 hours)
   - [ ] Test integration

2. **Week 2: Extract Modal Logic (Medium Risk)**
   - [ ] EventModalsContainer (3-4 hours)
   - [ ] Test modal workflows
   - [ ] Update CalendarPage to use new container

3. **Week 3: Extract Main View (Higher Risk)**
   - [ ] CalendarMainView (4-6 hours)
   - [ ] Create DayView component
   - [ ] Comprehensive testing

4. **Week 4: Refactor Hooks (Highest Risk)**
   - [ ] Create useCalendarState hook (3-4 hours)
   - [ ] Split useEventOperations (4-6 hours)
   - [ ] Integration testing

5. **Week 5: Polish & Optimization**
   - [ ] AlertsManager component (2-3 hours)
   - [ ] Performance testing
   - [ ] Code review

## Testing Strategy

### For Each Component:

1. **Unit Tests** - Test component in isolation
   ```typescript
   // Example: SyncStatusBanner.test.tsx
   describe('SyncStatusBanner', () => {
     it('shows sync status when syncing', () => { ... })
     it('shows error message when connection fails', () => { ... })
     it('calls onRetrySync when retry button clicked', () => { ... })
   })
   ```

2. **Integration Tests** - Test with CalendarPage
   ```typescript
   // Example: CalendarPage.integration.test.tsx
   describe('CalendarPage with SyncStatusBanner', () => {
     it('displays sync status after sync completes', () => { ... })
   })
   ```

3. **Visual Regression Tests** - Ensure UI doesn't break
   - Screenshot comparison before/after refactoring

## Risk Mitigation

### High-Risk Areas:

1. **Event Operations** - Complex state transitions
   - **Mitigation:** Comprehensive tests before refactoring
   - **Rollback Plan:** Keep original useEventOperations as backup

2. **Modal State Management** - Timing-sensitive
   - **Mitigation:** Incremental refactoring with feature flags
   - **Testing:** Manual QA of all modal workflows

3. **Sync Logic** - Critical for data integrity
   - **Mitigation:** Don't touch sync logic, only move UI
   - **Testing:** Test sync before/after on real Firebase

### Rollback Strategy:

- Keep original CalendarPage.tsx as `CalendarPage.legacy.tsx`
- Use feature flag to switch between old/new implementations
- Remove legacy code only after 2 weeks of stable production use

## Performance Targets

### Before Refactoring:
- Initial render: ~150ms
- Re-render on state change: ~50-100ms
- Bundle size: CalendarPage ~80KB

### After Refactoring:
- Initial render: <100ms (target: 30% improvement)
- Re-render on state change: <30ms (target: 50% improvement via selective memoization)
- Bundle size: Total ~85KB (slight increase acceptable for code splitting benefits)

## Success Metrics

1. **Code Metrics:**
   - ✅ No file >300 lines
   - ✅ Max 10 state variables per component
   - ✅ Test coverage >70%

2. **Performance:**
   - ✅ Lighthouse score >90
   - ✅ No unnecessary re-renders (measured with React DevTools)

3. **Developer Experience:**
   - ✅ New features can be added in <1 hour
   - ✅ Bugs can be fixed without touching multiple files
   - ✅ New developers understand structure in <30 minutes

## Future Enhancements

After refactoring, these improvements become easier:

1. **State Management Migration**
   - Move from useState to Zustand/Jotai
   - Centralize event/calendar state

2. **Advanced Features**
   - Drag-and-drop event rescheduling
   - Multi-calendar view
   - Calendar sharing

3. **Performance**
   - Code splitting by view type
   - Lazy load heavy components
   - Virtual scrolling for large event lists

## References

- [Original Code Review](../architecture/code-review-2025-12.md)
- [React Component Patterns](https://www.patterns.dev/react)
- [Testing Best Practices](./testing-strategy.md)

---

**Last Updated:** 2025-12-25
**Status:** Planning Phase
**Owner:** Development Team
