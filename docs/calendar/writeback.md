# Calendar Writeback

Writeback is the push path from canonical events to Google Calendar. It is driven by a Firestore queue processed by Cloud Functions.

## Queue Collection

```
users/{uid}/calendarWritebackQueue/{jobId}
```

Each job contains:

- `op`: create | update | delete | rsvp | update_attendees
- `payload`: normalized event data for Google Calendar
- `status`: pending | processing | failed | succeeded
- `attempts`, `availableAtMs`, `lastError`

See `functions/src/google/writeback.ts` for the full schema.

## Lifecycle

```
Canonical write -> enqueueWriteback -> queue job (pending)
  -> onWritebackJobCreated / scheduleWritebackProcessing
  -> claimJob (processing)
  -> Google API call
  -> update canonical syncState + providerRef
  -> succeeded or failed (retry)
```

## Retry Behavior

- Exponential backoff based on attempts
- Permanent failure after max retries
- Conflicts (etag mismatch) are treated as retryable

## Canonical Event Updates

Writeback updates the canonical event with:

- `syncState`
- `providerRef.providerEventId`
- `providerRef.etag`
- `providerUpdatedAtMs`
- `lastWritebackAtMs`
- `writebackError`

## Endpoints

Defined in `functions/src/index.ts`:

- `enqueueWriteback` (HTTP)
- `retryWriteback` (HTTP)
- `processWritebackQueue` (HTTP)
- `onWritebackJobCreated` (Firestore)
- `scheduleWritebackProcessing` (scheduled)

## Related Docs

- `docs/sync/overview.md`
- `docs/sync/outbox.md`
- `docs/calendar/sync-schema.md`
