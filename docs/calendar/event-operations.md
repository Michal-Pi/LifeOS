# Calendar Event Operations (Phase 2.1)

This document describes how event creation, editing, and deletion work in LifeOS, including offline-first behavior and conflict resolution.

## Overview

Events can be created locally and synced to Firestore. The system uses an **IndexedDB-backed outbox** to queue operations when offline and automatically replays them when connectivity returns.

---

## All-Day Event Semantics

All-day events are stored differently from timed events:

| Field | Timed Event | All-Day Event |
|-------|-------------|---------------|
| `allDay` | `false` | `true` |
| `startMs` | Epoch ms of start time | Epoch ms of `00:00:00` on start date |
| `endMs` | Epoch ms of end time | Epoch ms of `23:59:59` on end date |
| `startIso` | Full ISO timestamp | Full ISO timestamp (time part is midnight) |
| `endIso` | Full ISO timestamp | Full ISO timestamp (time part is 23:59:59) |

### Validation Rules

- **Timed events**: `endMs > startMs` (end must be strictly after start)
- **All-day events**: end date >= start date (same-day all-day events allowed)

---

## Soft Delete Strategy

Events are **soft deleted** rather than physically removed from Firestore:

```typescript
// When deleting an event:
{
  deletedAtMs: Date.now(),  // Marks as deleted
  updatedAtMs: Date.now()   // For conflict detection
}
```

### Why Soft Delete?

1. **Sync safety**: Avoids race conditions with provider sync
2. **Audit trail**: Enables undo functionality in future
3. **Conflict resolution**: Deleted events can be restored if needed

### Querying Non-Deleted Events

Use the `isDeleted()` helper:

```typescript
import { isDeleted } from '@lifeos/calendar'

const activeEvents = events.filter(e => !isDeleted(e))
```

---

## Offline-First Outbox

The outbox ensures operations succeed even when offline.

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│  UI Action  │────▸│   Outbox     │────▸│ Firestore │
│  (create/   │     │  (IndexedDB) │     │           │
│   edit/del) │     └──────────────┘     └───────────┘
└─────────────┘            │
       │                   ▼
       └───── Optimistic ──┘
              UI Update
```

### Operation Types

| Type | Payload | Description |
|------|---------|-------------|
| `create` | `{ event: CanonicalCalendarEvent }` | New event |
| `update` | `{ event: CanonicalCalendarEvent }` | Full updated event |
| `delete` | `{}` | Soft delete (uses `baseUpdatedAtMs`) |

### Operation Lifecycle

1. **pending**: Queued, waiting to apply
2. **applying**: Currently being sent to Firestore
3. **applied**: Successfully written (auto-cleaned after time)
4. **failed**: Error occurred, will retry with backoff

### Retry Strategy

- Exponential backoff: `min(60s, 1s × 2^attempts)`
- Retries on network errors, Firestore errors
- Failed ops remain visible with error message

### Worker Behavior

- Starts on page load with `startOutboxWorker(userId)`
- Drains queue every 10 seconds
- Immediately drains when network comes back online
- Skips draining when offline

---

## Conflict Resolution: Last-Write-Wins

The system uses **Last-Write-Wins (LWW)** based on `updatedAtMs`:

1. Each update includes `baseUpdatedAtMs` (timestamp when edit started)
2. Server always accepts writes (no blocking)
3. UI shows conflict indicator if `baseUpdatedAtMs` differs from server

### Example Flow

```
User A edits event at 10:00 (baseUpdatedAtMs = 1000)
User B edits same event at 10:01 (baseUpdatedAtMs = 1000)
User A saves at 10:02 → event.updatedAtMs = 1002
User B saves at 10:03 → event.updatedAtMs = 1003 (wins)
```

---

## UI Sync Indicators

### Per-Event Indicators

| Indicator | Meaning |
|-----------|---------|
| 🟡 Orange dot | Operation pending |
| 🔴 Red dot | Operation failed |
| (none) | Synced successfully |

### Global Indicators

- **Online/Offline badge**: Shows network status
- **Pending count**: Number of queued operations

---

## Recurring Events

**Current limitation**: Recurring events cannot be edited or deleted.

The system checks for:
- `recurrence.recurrenceRules` array
- `providerRef.recurringEventId` field

If either exists, edit/delete operations are blocked with an error message.

---

## Code Locations

| Component | Path |
|-----------|------|
| Domain models | `packages/calendar/src/domain/models.ts` |
| Event usecases | `packages/calendar/src/usecases/eventUsecases.ts` |
| Outbox types | `apps/web-vite/src/outbox/types.ts` |
| Outbox store | `apps/web-vite/src/outbox/store.ts` |
| Outbox worker | `apps/web-vite/src/outbox/worker.ts` |
| Firestore adapter | `apps/web-vite/src/adapters/firestoreCalendarEventRepository.ts` |
| Event form | `apps/web-vite/src/components/EventFormModal.tsx` |
| Delete confirm | `apps/web-vite/src/components/DeleteConfirmModal.tsx` |
| Calendar page | `apps/web-vite/src/pages/CalendarPage.tsx` |




