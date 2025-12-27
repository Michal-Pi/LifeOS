# LifeOS Calendar Architecture (Phase 2.3)

All calendar data lives under `/users/{uid}` with separate spaces for raw ingestion, canonical data, sync state, and composites. UI code, adapters, and use cases operate exclusively against the canonical collections so provider payloads never leak into the web tier.

## Accounts

`/users/{uid}/calendarAccounts/{accountId}`

- `provider`: `"google"` (future `"microsoft"`, `"icloud"`)
- `status`: `"connected" | "needs_attention" | "disconnected"`
- `email`: optional, surfaced for UI discovery
- `createdAt`, `updatedAt`, `lastSyncAt`, `lastSuccessAt`, `nextSyncAt`
- `error`: structured object with `code`/`message`
- **Tokens do not live here**—see `/users/{uid}/privateIntegrations/googleAccounts/{accountId}` (server-only).

## Calendars

`/users/{uid}/calendars/{calendarId}`

- `accountId`, `providerCalendarId`, `provider`
- `name`, `color`, `accessRole`, `canWrite`
- `visible` boolean, `updatedAt`

## Raw ingestion

`/users/{uid}/rawCalendarEvents/{accountId}/{providerCalendarId}/events/{providerEventId}`

- Stores provider-native payload (Google event shape) plus:
  - `ingestedAt`, `syncRunId`, `provider`, `accountId`, `providerCalendarId`
  - `rawJson`: canonical copy of payload (optional, for debugging)

## Canonical events (source of truth)

`/users/{uid}/calendarEvents/{canonicalEventId}`

- Deterministic `canonicalEventId` key: `${provider}:${accountId}:${providerCalendarId}:${providerEventId}`
- `schemaVersion`, `normalizationVersion`, `createdAt`, `updatedAt`, `status`, `visibility`, `transparency`
- Provider references (provider + accountId + calendarId + eventId + etag), `iCalUID`
- `title`, `description`, `location`, `hangoutLink`, `conferencing`
- `start`: `{ iso: string; epochMs: number; timezone?: string }`, same for `end`
- `allDay` flag, `timezone`, `startMs`, `endMs`
- `occursOn`: string[] of YYYY-MM-DD keys (event timezone or user display timezone) for query
- `attendees`, `reminders`, `recurrence` stubs, attachments, `providerCalendarId`, `providerEventId`

## Sync state

`/users/{uid}/calendarSyncState/{accountId}`

- Maps `providerCalendarId` → `{ syncToken?, pageToken? }`
- `lastFullSyncAt`, `lastIncrementalSyncAt`, `lastError`, `schemaVersion`, `normalizationVersion`

## Sync runs (audit)

`/users/{uid}/calendarSyncRuns/{runId}`

- `startedAt`, `endedAt`, `status`, `mode`
- Counts: `calendarsFetched`, `eventsFetched`, `rawWritten`, `canonicalUpserted`, `canonicalDeleted`
- `errors[]`, `cursorInfo`, `accountId`

## Composite Events (Phase 2.0E)

`/users/{uid}/compositeEvents/{compositeEventId}`

Composite events link multiple canonical events that represent the **same real-world event** across different calendar providers or accounts. This enables deduplication in unified views.

### Schema

```typescript
interface CompositeEvent {
  compositeEventId: string // UUID

  // Member references (2+ canonical events)
  members: CompositeMember[]
  canonicalEventIds: string[] // Denormalized for queries

  // How the link was established
  heuristic: 'icaluid' | 'time-title' | 'manual'
  confidence: number // 0.0 - 1.0

  // Representative data (from primary member)
  primaryCanonicalEventId: string
  title?: string // Cached for display
  startMs: number // Cached for sorting

  // Metadata
  createdAt: string
  updatedAt: string
  createdBy?: 'system' | 'user'
}

interface CompositeMember {
  canonicalEventId: string
  provider: Provider
  accountId: string
  providerCalendarId: string
  providerEventId: string
  iCalUID?: string // Key for icaluid matching
  role: 'primary' | 'duplicate'
}
```

### Deduplication Heuristics

| Heuristic    | Confidence | Criteria                                          |
| ------------ | ---------- | ------------------------------------------------- |
| `icaluid`    | 0.95       | Same `iCalUID` across different accounts          |
| `time-title` | 0.75       | Same start time (±5 min) + normalized title match |
| `manual`     | 1.0        | User explicitly linked events                     |

### Query Patterns

1. **Find composites for a canonical event**:

   ```
   where('canonicalEventIds', 'array-contains', eventId)
   ```

2. **Find composites in date range**:
   ```
   where('startMs', '>=', rangeStart)
   where('startMs', '<=', rangeEnd)
   ```

### Sync Integration

During sync, after upserting canonical events:

1. Extract `iCalUID` from new/updated events
2. Query existing events with matching `iCalUID` (different accounts)
3. Create/update composite if match found
4. Track counts in `syncRuns.compositeCreated`, `syncRuns.compositeUpdated`

---

## Sync Runs (updated for Phase 2.0E)

`/users/{uid}/calendarSyncRuns/{runId}`

```typescript
interface CalendarSyncRun {
  runId: string
  accountId: string
  startedAt: string
  endedAt?: string
  status: 'in_progress' | 'completed' | 'failed'
  mode: 'full' | 'incremental' | 'manual'

  // Event counts
  counts: {
    calendarsFetched: number
    eventsFetched: number
    rawWritten: number
    canonicalUpserted: number
    canonicalDeleted: number
    // NEW: Composite counts
    compositeCreated: number
    compositeUpdated: number
    duplicatesDetected: number
  }

  errors: Array<{ code: string; message: string; eventId?: string }>
  cursorInfo?: { syncToken?: string; pageToken?: string }
}
```

---

## Writeback Queue (Phase 2.2)

`/users/{uid}/calendarWritebackQueue/{jobId}`

Server-side queue for writing canonical changes back to Google Calendar.

### Schema

```typescript
interface WritebackJob {
  jobId: string
  uid: string
  eventId: string // Canonical event ID

  op: 'create' | 'update' | 'delete'
  provider: 'google'
  accountId: string
  providerCalendarId: string
  providerEventId?: string // Required for update/delete

  payload: {
    title?: string
    description?: string
    location?: string
    startIso?: string
    endIso?: string
    allDay?: boolean
    timezone?: string
    transparency?: string
    visibility?: string
  }

  baseProviderEtag?: string // For optimistic concurrency
  createdAtMs: number
  availableAtMs: number // For retry scheduling
  attempts: number
  maxAttempts: number // Default: 10
  status: 'pending' | 'processing' | 'failed' | 'succeeded'
  lastError?: { code?: string; message: string; atMs?: number }
}
```

### Sync Metadata on Canonical Events

```typescript
// Added to CanonicalCalendarEvent
{
  canonicalUpdatedAtMs: number    // When canonical was last updated locally
  providerUpdatedAtMs?: number    // When provider last updated this event
  lastWritebackAtMs?: number      // When we last wrote back to provider
  syncState: SyncState            // Current sync status
  writebackError?: WritebackError // Last error details
  writebackBlockedReason?: string // Why writeback is blocked (e.g., recurring)
  source: { type: 'provider' | 'local' }
}

type SyncState =
  | 'synced'              // In sync with provider
  | 'pending_writeback'   // Local changes waiting to be written
  | 'error'               // Writeback failed
  | 'conflict'            // Conflict detected
  | 'read_only_provider'  // Cannot write back (e.g., recurring event)
```

### Writeback Pipeline Flow

```
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│  Client writes  │ ──▶ │ Canonical updated │ ──▶ │ enqueueWriteback│
│  to canonical   │     │ syncState=pending │     │    (Function)   │
└─────────────────┘     └───────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│ Google Calendar │ ◀── │ processWriteback  │ ◀── │  WritebackJob   │
│      API        │     │    (Function)     │     │   created       │
└────────┬────────┘     └───────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ On success: Update canonical with providerEventId, etag, syncState │
│ On failure: Mark job for retry or failed, update writebackError    │
└─────────────────────────────────────────────────────────────────────┘
```

### Retry Policy

| Attempt | Delay         |
| ------- | ------------- |
| 1       | 1 minute      |
| 2       | 5 minutes     |
| 3       | 15 minutes    |
| 4       | 1 hour        |
| 5+      | 6 hours (cap) |

### Error Categorization

| Category     | Action                             | Examples        |
| ------------ | ---------------------------------- | --------------- |
| `auth`       | Fail, mark account needs_attention | `invalid_grant` |
| `validation` | Fail permanently                   | 400, 403, 404   |
| `conflict`   | Fail, mark syncState=conflict      | 409, 412        |
| `transient`  | Retry with backoff                 | 500, 502, 503   |

---

## Conflict Handling (Phase 2.2B)

### Deterministic Resolution Strategy

When processing a writeback job:

1. Load canonical event
2. If event has a provider reference:
   - Compare `providerUpdatedAtMs` (from last sync) vs `canonicalUpdatedAtMs`
   - If `providerUpdatedAtMs > canonicalUpdatedAtMs`:
     - If event has pending local writeback (job exists / syncState pending): **Keep local**, attempt writeback anyway
     - Else: **Provider wins**, do not write back, set `syncState=conflict`

### Preventing Phantom Events

- **Create rule**: If canonical already has `providerEventId`, do PATCH not INSERT
- **Transaction guard**: Only one pending create job per canonical event

### Origin Guard (Preventing Loops)

- Sync pipeline sets `source.type = 'provider'` when updating from Google
- Writeback is skipped if `source.type === 'provider'`
- Local edits set `source.type = 'local'`

---

## Recurrence Engine (Phase 2.3)

### Canonical Recurrence Schema

```typescript
type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

interface CanonicalRecurrenceRule {
  freq: RecurrenceFrequency
  interval?: number // Default 1
  byWeekday?: Weekday[] // For WEEKLY
  byMonthDay?: number[] // For MONTHLY
  byMonth?: number[] // For YEARLY
  count?: number // Stop after N occurrences
  untilMs?: number // Stop at this timestamp (inclusive)
  wkst?: 'MO' | 'SU' // Week start day
}

interface CanonicalRecurrence {
  tz?: string // IANA timezone
  rule: CanonicalRecurrenceRule
  exdatesMs?: number[] // Excluded occurrences (by startMs)
  overrides?: Record<string, CanonicalEventOverride>
  split?: RecurrenceSplit
}

interface CanonicalEventOverride {
  title?: string
  location?: string
  description?: string
  startMs?: number
  endMs?: number
  allDay?: boolean
  status?: 'confirmed' | 'tentative' | 'cancelled'
  updatedAtMs: number
  providerInstanceId?: string
}

interface RecurrenceSplit {
  splitAtMs: number
  childSeriesId?: string // For parent series
  parentSeriesId?: string // For child series
}
```

### Canonical Event Recurrence Fields

```typescript
// Added to CanonicalCalendarEvent
{
  recurrenceV2?: CanonicalRecurrence  // New canonical format
  isRecurringSeries?: boolean         // True if this is a master series
  isRecurrenceInstance?: boolean      // True if provider exception
  seriesId?: string                   // Points to master (for instances)
  originalStartTimeMs?: number        // Original occurrence time
}
```

### Instance Identity Scheme

Instances are identified by a deterministic key:

```
instanceId = seriesId + ":" + occurrenceStartMs
occurrenceKey = occurrenceStartMs (string)
```

This ensures:

- Stable identity across devices
- Deduplication when syncing
- Correct mapping to provider instance IDs

### Instance Generation (Range-based)

```
UI Request (startMs, endMs)
     ↓
Load recurring masters that may intersect range
     ↓
For each master:
  - Use rrule library to calculate occurrences
  - Apply exdates (exclusions)
  - Apply overrides (modifications)
  - Respect split boundaries
     ↓
Merge with single events
     ↓
Return unified render list
```

**Safeguards:**

- Max 500 instances per query (configurable)
- Lookback limited to 1 year for past series
- No pre-materialization of instances

### Edit Scopes

| Scope             | Action               | Canonical Effect                   |
| ----------------- | -------------------- | ---------------------------------- |
| `this`            | Edit single instance | Add to `overrides` map             |
| `this_and_future` | Split series         | Old series ends, new series starts |
| `all`             | Edit master          | Update series master fields/rule   |

### Split Strategy (This and Future)

```
Before:  [------- Series A -------]
                  ↓ split at occurrence X
After:   [Series A (until X-1)] [Series B (from X) ----]
```

- Old series: `untilMs` set to previous occurrence
- New series: Created with same rule, inherits settings
- Link maintained via `split.childSeriesId` / `split.parentSeriesId`

### Exception Strategy (This Event)

```typescript
// Override keyed by occurrence start time
overrides: {
  "1704110400000": {  // occurrenceStartMs
    title: "Modified Title",
    startMs: 1704114000000,  // Moved time
    updatedAtMs: Date.now()
  }
}
```

### Write-back to Google (Phase 2.3 extensions)

**Create Series:**

- Send `recurrence: ["RRULE:..."]` in event.insert

**Edit This Event:**

1. Resolve provider instance ID via `events.instances` API
2. Patch the specific instance
3. Store mapping in canonical override

**Edit This and Future (Split):**

1. Update old series with `UNTIL`
2. Create new series starting at split point

**Delete This Event:**

- Add `EXDATE` to series

### Instance ID Resolution Cache

`/users/{uid}/recurrenceInstanceMap/{seriesId}`

Caches the mapping from canonical occurrence keys to Google instance IDs:

```typescript
interface InstanceMapping {
  seriesId: string // Canonical series ID
  providerSeriesId: string // Google recurring event ID
  accountId: string
  calendarId: string
  occurrences: Record<
    string,
    {
      providerInstanceId: string
      providerEtag: string
      providerUpdatedAtMs: number
      originalStartMs: number
    }
  >
  fetchedAtMs: number
  rangeMinMs: number
  rangeMaxMs: number
}
```

**Resolution Flow:**

1. Check cache for occurrence key
2. If cache miss or stale, fetch via `events.instances` API (7-day window)
3. Cache results for future lookups
4. Return instance ID for write-back

---

## Attendees & RSVP (Phase 2.4)

### Canonical Attendee Model

Each canonical event includes attendee information when available:

```typescript
type CanonicalResponseStatus = 'needsAction' | 'accepted' | 'tentative' | 'declined' | 'unknown'

interface CanonicalAttendee {
  email?: string
  displayName?: string
  self?: boolean // True for the current user
  organizer?: boolean // True for the event organizer
  optional?: boolean
  resource?: boolean // Room/resource
  responseStatus: CanonicalResponseStatus
  comment?: string
  additionalGuests?: number
}

interface CanonicalOrganizer {
  email?: string
  displayName?: string
  self?: boolean
}

interface CanonicalCreator {
  email?: string
  displayName?: string
  self?: boolean
}
```

### Event Role Detection

The user's role in an event is determined by:

1. **Organizer**: `organizer.self === true`
2. **Attendee**: Any `attendee.self === true`
3. **Creator fallback**: `creator.self === true` with no explicit organizer
4. **Unknown**: No self markers present

```typescript
type CanonicalEventRole = 'organizer' | 'attendee' | 'unknown'

// Helper functions
function getEventRole(event): CanonicalEventRole
function canRespond(event): boolean // True for attendees
function canUpdate(event): boolean // True for organizers
function canCancel(event): boolean // True for organizers
```

### RSVP Flow

**Attendee RSVP:**

1. User clicks Accept/Maybe/Decline in UI
2. Canonical event updated with new `selfAttendee.responseStatus`
3. `syncState` set to `pending_writeback`
4. Writeback job created with `op: 'rsvp'`
5. Cloud Function patches Google event with updated attendee status

**Writeback Job for RSVP:**

```typescript
{
  op: 'rsvp',
  payload: {
    selfEmail: string,
    newStatus: CanonicalResponseStatus
  }
}
```

### Organizer Flow

**Add/Remove Attendees:**

1. Organizer modifies attendee list in UI
2. Canonical event updated with new attendees
3. Writeback job created with `op: 'update_attendees'`
4. Cloud Function patches Google event with `sendUpdates: 'all'`

**Writeback Job for Attendee Updates:**

```typescript
{
  op: 'update_attendees',
  payload: {
    attendees: CanonicalAttendee[],
    sendUpdates: 'all' | 'none' | 'externalOnly'
  }
}
```

### Busy/Free Rules

Events affect busy/free calculation based on:

1. **Transparency**: `transparent` events are always free
2. **RSVP Status**: `declined` events don't block time
3. **Default**: All other events block time

```typescript
function isEventBusy(event): boolean {
  // Declined = not busy
  if (selfAttendee?.responseStatus === 'declined') return false
  // Transparent = not busy
  if (event.transparency === 'transparent') return false
  // Default = busy
  return true
}
```

### Provider Capabilities

Derived from role and calendar permissions:

```typescript
interface ProviderCapabilities {
  canInvite?: boolean // Organizer only
  canRespond?: boolean // Attendee only
  canUpdate?: boolean // Organizer only
  canCancel?: boolean // Organizer only
}
```

---

## Notes

- Firestore security rules must allow only authenticated user access inside `/users/{uid}/…`.
- Private integration tokens live at `/users/{uid}/privateIntegrations/**` and are denied to clients.
- Writeback queue is read-only for clients (status visibility), write-only for server (Cloud Functions).
- OccursOn date keys are computed per canonical event and capped (e.g., iterating up to 60 days) to avoid runaway arrays.
