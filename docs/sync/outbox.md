# Outbox System

The outbox is an IndexedDB-backed queue that enables offline-first operation for calendar events.
Todos do not use the outbox; they rely on Firestore's offline persistence.

## Overview

```
User Action → Outbox (IndexedDB) → Firestore → Provider Writeback
                  ↑                    ↓
                  └── Retry on failure ←
```

## Operation Schema

```typescript
interface OutboxOp {
  opId: string // Unique operation ID
  type: 'create' | 'update' | 'delete'
  userId: string
  eventId: string
  payload: { event: CanonicalCalendarEvent } | {}

  // Conflict resolution
  baseRev?: number // Server rev when client started editing
  baseUpdatedAtMs?: number
  deviceId: string // Stable device identifier

  // Timing
  createdAtMs: number // When op was created
  availableAtMs: number // When op can be retried (backoff)
  attempts: number // Number of attempts so far
  maxAttempts: number // Max attempts before giving up

  // Status
  status: 'pending' | 'applying' | 'failed' | 'applied'
  lastError?: { message: string; code?: string; timestamp?: number }
}
```

## Status Flow

```
pending → applying → applied
    ↓         ↓
    └─────→ failed (retry) → pending
```

## Coalescing

The outbox automatically coalesces operations:

### Multiple Updates

If you update an event multiple times before sync:

```
Update A (title: "Foo") → stored
Update B (title: "Bar") → replaces A
Sync → only "Bar" is sent
```

### Delete Overrides

If you delete an event with pending updates:

```
Update A → stored
Update B → stored
Delete   → A and B removed, delete stored
Sync     → only delete is sent
```

## Exponential Backoff

Failed operations are retried with exponential backoff + jitter:

| Attempt | Base Delay | With Jitter (±20%) |
| ------- | ---------- | ------------------ |
| 1       | 1s         | 0.8s - 1.2s        |
| 2       | 2s         | 1.6s - 2.4s        |
| 3       | 4s         | 3.2s - 4.8s        |
| 4       | 8s         | 6.4s - 9.6s        |
| 5       | 16s        | 12.8s - 19.2s      |
| ...     | ...        | ...                |
| Max     | 60s        | 48s - 72s          |

After 10 attempts, the operation stays in `failed` status until manually retried.

## API

### Enqueue Operations

```typescript
import { enqueueCreate, enqueueUpdate, enqueueDelete } from '@/outbox/worker'

// Create
await enqueueCreate(userId, event)

// Update (with base rev for conflict detection)
await enqueueUpdate(userId, event, baseRev)

// Delete
await enqueueDelete(userId, eventId, baseRev, baseUpdatedAtMs)
```

### Retry Operations

```typescript
import { retryFailedOp, retryAllFailed } from '@/outbox/worker'

// Retry single op
await retryFailedOp(opId)

// Retry all failed
const count = await retryAllFailed(userId)
```

### Listen for Changes

```typescript
import { addOutboxListener } from '@/outbox/worker'

const unsubscribe = addOutboxListener(({ pending, failed }) => {
  console.log(`${pending} pending, ${failed} failed`)
})
```

### Get Status

```typescript
import { getOutboxStatus, listPending, listAll } from '@/outbox/worker'

const stats = await getOutboxStatus(userId)
// { pending: 2, failed: 1, applying: 0, applied: 5, total: 8 }

const pending = await listPending(userId)
const all = await listAll(userId)
```

## IndexedDB Schema

Database: `lifeos-outbox` (version 2)

Store: `outbox`

- Key: `opId`
- Indexes:
  - `userId` - For filtering by user
  - `eventId` - For coalescing
  - `status` - For status queries
  - `availableAtMs` - For backoff scheduling

## Worker Lifecycle

```typescript
import { startOutboxWorker, stopOutboxWorker } from '@/outbox/worker'

// Start (call once on app init)
startOutboxWorker(userId)

// Stop (call on logout/cleanup)
stopOutboxWorker()
```

The worker:

- Polls every 5 seconds for ready operations
- Listens for online/offline events
- Drains immediately when back online
- Processes operations sequentially per event

## Conflict Handling

When an operation fails due to a conflict:

1. The operation is marked as `failed` with `code: 'conflict'`
2. The conflict resolution logic determines the winner
3. If the incoming update wins, it's applied
4. If the server wins, the local change is discarded

See [conflict-strategy.md](./conflict-strategy.md) for details.

## UI Integration

### Show Status

```tsx
const [pending, setPending] = useState(0)
const [failed, setFailed] = useState(0)

useEffect(() => {
  return addOutboxListener(({ pending, failed }) => {
    setPending(pending)
    setFailed(failed)
  })
}, [])

return (
  <div>
    {pending > 0 && <span>{pending} syncing…</span>}
    {failed > 0 && <button onClick={() => retryAllFailed(userId)}>{failed} failed - Retry</button>}
  </div>
)
```

### Per-Event Status

```tsx
const hasPending = pendingOps.some((op) => op.eventId === event.canonicalEventId)
const failedOp = failedOps.find((op) => op.eventId === event.canonicalEventId)

return (
  <div>
    {hasPending && <span>Syncing…</span>}
    {failedOp && <button onClick={() => retryFailedOp(failedOp.opId)}>Retry</button>}
  </div>
)
```

## Debugging

### Browser DevTools

1. Open Application → IndexedDB → `lifeos-outbox`
2. View the `outbox` store
3. Check operation status, attempts, errors

### Console Logging

The worker logs to console:

- `[Outbox] Applied {type} for event {id}`
- `[Outbox] Failed {type} for event {id}: {error}`
- `[Outbox] Back online, draining queue`

### Clear Outbox

In browser console:

```javascript
indexedDB.deleteDatabase('lifeos-outbox')
```

## Invariants

1. **No duplicate events**: Event IDs are stable; create uses transactions
2. **No lost operations**: Failed ops are retried with backoff
3. **Offline-first**: Operations queue locally and sync when online
4. **Deterministic merge**: Conflicts resolve consistently across devices

## Related Documentation

- [Conflict Strategy](./conflict-strategy.md)
- [Calendar Architecture](../../packages/calendar/ARCHITECTURE.md)
