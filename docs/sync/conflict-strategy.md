# Conflict Resolution Strategy

Phase 2.7 introduces deterministic conflict resolution for canonical calendar events.

## Strategy: Last-Write-Wins with Revision Guard

We use **LWW with revision guard + deviceId tie-break** to ensure:
1. Cross-device edits converge to the same state
2. No duplicate events are created
3. Conflicts are resolved deterministically

## Key Concepts

### Revision Number (`rev`)

Every canonical event has a `rev` (revision) number:
- Starts at 1 on creation
- Increments on every successful update
- Used as an optimistic concurrency check

### Device ID (`updatedByDeviceId`)

Each device has a stable, unique ID:
- Generated on first use and persisted in `localStorage`
- Used for tie-breaking when timestamps are equal
- Format: `device-{timestamp}-{random}`

### Conflict Detection

A conflict occurs when:
```
incoming.baseRev !== server.rev
```

This means another device updated the event since we last read it.

## Resolution Algorithm

```typescript
function resolveConflict(server, incoming):
  if incoming.baseRev === server.rev:
    // No conflict: apply incoming and increment rev
    return { winner: merge(server, incoming), newRev: server.rev + 1 }
  
  // Conflict detected - determine winner:
  
  if incoming.updatedAtMs > server.canonicalUpdatedAtMs:
    // Incoming is newer: incoming wins
    return { winner: merge(server, incoming), newRev: server.rev + 1 }
  
  if server.canonicalUpdatedAtMs > incoming.updatedAtMs:
    // Server is newer: server wins (no change)
    return { winner: server, newRev: server.rev }
  
  // Timestamps equal: tie-break by deviceId (lexicographically lower wins)
  if incoming.deviceId < server.updatedByDeviceId:
    return { winner: merge(server, incoming), newRev: server.rev + 1 }
  else:
    return { winner: server, newRev: server.rev }
```

## Guarantees

### 1. Convergence
All devices will converge to the same final state:
- The algorithm is deterministic given the same inputs
- DeviceId tie-breaking ensures a consistent winner

### 2. No Duplicates
- Event IDs are stable and never regenerated
- Create operations use transactions to prevent duplicate docs
- The outbox ensures idempotent retries

### 3. No Data Loss
- Updates are queued locally before attempting sync
- Failed operations are retried with exponential backoff
- Users can manually retry failed operations

## Edge Cases

### Same-Millisecond Updates
When two devices update at the exact same millisecond:
- DeviceId with the lower lexicographic value wins
- This is arbitrary but deterministic

### Offline Edits
When a device comes back online after being offline:
- Its outbox drains and applies pending updates
- Conflicts are resolved normally
- The user sees the resolved state

### Rapid Updates
Multiple rapid updates from the same device:
- Outbox coalescing merges them into one operation
- Only the final state is synced

## Implementation Details

### Firestore Transactions
All updates use Firestore transactions to:
- Read current server state atomically
- Apply conflict resolution logic
- Write the winner atomically with incremented rev

### Immutable Fields
These fields are never changed by conflict resolution:
- `canonicalEventId` - Event identity
- `providerRef` - Provider reference
- `externalRefs` - External references
- `createdAt` / `createdAtMs` - Creation timestamp

## Debugging

### Check Event State
In the browser console:
```javascript
// Get event details
const event = await repository.getById('user-id', 'event-id')
console.log('Rev:', event.rev)
console.log('Last updated by:', event.updatedByDeviceId)
console.log('Canonical updated at:', event.canonicalUpdatedAtMs)
```

### Check Device ID
```javascript
localStorage.getItem('lifeos-device-id')
```

### Force Conflict
For testing, you can:
1. Open the app in two browsers/tabs
2. Edit the same event in both
3. Submit both before either syncs
4. Observe conflict resolution in console logs

## UI Indicators

| Sync State | Meaning |
|------------|---------|
| `synced` | Event is in sync with server |
| `pending_writeback` | Local changes waiting to sync |
| `error` | Sync failed (can retry) |
| `conflict` | Conflict detected (rare, auto-resolved) |

## Related Documentation

- [Outbox](./outbox.md) - Local operation queue
- [Calendar Architecture](../../packages/calendar/ARCHITECTURE.md) - Overall design





