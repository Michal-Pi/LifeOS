# Composite Events (Phase 2.9)

Composite events provide a unified view across multiple connected calendar accounts, merging duplicate events while preserving the underlying canonical data.

## Overview

```
Google Account 1 → Canonical Event A ─┐
                                      ├─→ CompositeEvent
Google Account 2 → Canonical Event B ─┘
```

## Schema

### CompositeEvent

Stored at: `/users/{uid}/compositeEvents/{compositeId}`

```typescript
interface CompositeEvent {
  id: string // Composite ID
  userId: string

  // Membership
  members: CompositeMemberRef[] // References to canonical events
  primaryMemberId: string // Which canonical event is "display source"

  // Derived display fields (from primary)
  startMs: number
  endMs: number
  allDay: boolean
  title?: string
  location?: string
  description?: string

  // Identity & dedupe
  iCalUID?: string // Shared iCalUID if all members have same
  dedupeKey?: string // Stable identity hash
  dedupeReason: DedupeReason // How they were matched

  // Auditing
  createdAtMs: number
  updatedAtMs: number
  lastComputedAtMs: number
  version: number

  // Safety
  manualLock?: boolean // If true, don't auto-merge/split
}

interface CompositeMemberRef {
  canonicalEventId: string
  provider: 'google' | 'microsoft'
  accountId: string
  providerCalendarId: string
  providerEventId?: string
  iCalUID?: string
  status?: 'confirmed' | 'cancelled' | 'tentative'
  updatedAtMs?: number
}
```

### CompositeRun

Audit log for composite recomputation runs.

Stored at: `/users/{uid}/compositeRuns/{runId}`

```typescript
interface CompositeRun {
  runId: string
  userId: string
  rangeStartMs: number
  rangeEndMs: number
  startedAtMs: number
  completedAtMs?: number
  status: 'running' | 'completed' | 'failed'
  stats: {
    eventsProcessed: number
    compositesCreated: number
    compositesUpdated: number
    compositesDeleted: number
    mergesPerformed: number
    errors: number
  }
  error?: string
}
```

## Dedupe Heuristics

### Priority Order

1. **Provider Event ID Match** (confidence: 0.98)
   - Same provider + same providerEventId across different accounts
   - Rare but deterministic

2. **iCalUID Match** (confidence: 0.95)
   - Calendar invites share the same iCalUID
   - Guardrail: time overlap within 1 day required

3. **Fuzzy Time-Title Match** (confidence: ~0.7)
   - Start times within 5 minutes
   - End times within 5 minutes
   - Duration difference ≤ 30 minutes
   - Title similarity ≥ 90%
   - Generic titles excluded ("meeting", "call", etc.)

### Guardrails (Prevent False Merges)

- Don't merge cancelled with confirmed (unless iCalUID matches)
- Don't merge if durations differ > 30 minutes
- Don't merge generic titles without iCalUID
- Don't modify manually-locked composites

### Generic Titles (Excluded from Fuzzy Match)

```
meeting, call, sync, chat, catchup,
1:1, 1on1, standup, weekly, daily,
check in, touch base, busy, hold, block, focus
```

## Pipeline

### Recomputation Flow

1. Fetch canonical events in range (last 30 days → next 365 days)
2. Run dedupe heuristics to find matches
3. Group matches using union-find
4. Create/update composite events
5. Delete stale composites
6. Log run results

### Triggers

- **After sync**: Call `recomputeComposites` endpoint
- **Scheduled**: Daily recomputation at 3 AM
- **Manual**: Trigger via API

## API

### Recompute Composites

```
GET /recomputeCompositesEndpoint?uid={userId}&startMs={ms}&endMs={ms}
```

Response:

```json
{
  "ok": true,
  "runId": "run-...",
  "eventsProcessed": 150,
  "compositesCreated": 5,
  "compositesUpdated": 2,
  "compositesDeleted": 0,
  "mergesPerformed": 7,
  "errors": 0,
  "durationMs": 1234
}
```

## UI Integration

### Unified View Toggle

```tsx
<UnifiedViewToggle
  isUnified={viewMode === 'unified'}
  onToggle={(unified) => setViewMode(unified ? 'unified' : 'canonical')}
  compositeCount={composites.length}
/>
```

### Composite Membership Panel

Shows which canonical events are merged:

```tsx
<CompositeMembershipPanel
  composite={selectedComposite}
  onViewMember={(canonicalId) => navigate(`/event/${canonicalId}`)}
/>
```

## Busy/Free (Phase 2.9B)

### getBusyBlocksUnified

Returns deduplicated busy blocks:

```typescript
const result = await getBusyBlocksUnified(deps, {
  userId: 'user-1',
  startMs: rangeStart,
  endMs: rangeEnd,
  useComposites: true, // Use composites for deduplication
  mergeOverlapping: true, // Merge adjacent blocks
})

// result.blocks: BusyBlock[]
// result.sourceMode: 'canonical' | 'composite' | 'mixed'
```

### Busy Rules

- Declined RSVP → not busy
- Transparent events → not busy
- Cancelled events → not busy

## Testing

### Unit Tests

```bash
pnpm --filter @lifeos/calendar test
```

Tests cover:

- iCalUID matching
- Fuzzy time-title matching
- Guardrails preventing false merges
- Busy block deduplication

### Integration Tests (Emulator)

1. Write two canonical events with same iCalUID
2. Verify composite is created
3. Mark one cancelled
4. Verify composite behavior

## Firestore Rules

```firestore
// Composite events (owner-only)
match /users/{userId}/compositeEvents/{compositeId} {
  allow read, write: if isAuthenticated(userId);
}

// Composite runs (server-only writes)
match /users/{userId}/compositeRuns/{runId} {
  allow read: if isAuthenticated(userId);
  allow write: if false;
}
```

## Manual Testing Checklist

- [ ] Connect two Google accounts with same calendar invite
- [ ] Verify composite is created with both members
- [ ] Toggle unified view on/off
- [ ] Verify membership panel shows both sources
- [ ] Edit one instance; verify composite updates
- [ ] Delete one instance; verify composite adjusts
- [ ] Manually lock composite; verify no auto-changes
