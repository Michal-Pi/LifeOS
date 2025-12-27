# Sync Overview

This document summarizes the calendar sync and writeback architecture at a system level.

## Scope

- Pull sync: Google Calendar -> canonical events in Firestore
- Push sync (writeback): canonical events -> Google Calendar
- Local outbox: offline queue for calendar edits

## High-Level Flow

```
User Action
  -> Outbox (IndexedDB)
  -> Firestore canonical event
  -> Writeback queue
  -> Google Calendar API

Provider Changes
  -> syncNow / scheduleSync
  -> canonical events
  -> UI refresh
```

## Components

- Web app
  - `apps/web-vite/src/outbox/worker.ts`
  - `apps/web-vite/src/hooks/useAutoSync.ts`
  - `apps/web-vite/src/hooks/useEventOperations.ts`
- Functions
  - `functions/src/google/syncEvents.ts` (pull)
  - `functions/src/google/writeback.ts` (push)
  - `functions/src/index.ts` (HTTP + scheduled endpoints)

## Triggers

- Manual sync: `syncNow` HTTP endpoint
- Scheduled pull: `scheduleSync` (every 15 minutes)
- Writeback enqueue: `enqueueWriteback` HTTP endpoint
- Writeback processing: `processWritebackQueue` HTTP endpoint + `scheduleWritebackProcessing`
- Writeback Firestore trigger: `onWritebackJobCreated`

## Sync State

Calendar sync state lives in:

```
users/{uid}/calendarSyncState/{accountId}:{calendarId}
```

Key fields:

- `syncToken` for incremental sync
- `lastSyncAt`, `lastSuccessAt`, `lastError`

Canonical events store:

- `syncState` (local/pending/synced/error variants)
- `writebackError`, `lastWritebackAtMs`

## Failure Modes

- Token invalidation -> full resync
- Writeback conflicts (etag mismatch) -> retry with backoff
- Offline edits -> queued and retried by outbox worker
- Provider errors -> marked on writeback job and surfaced in UI

## Related Docs

- `docs/sync/outbox.md`
- `docs/sync/conflict-strategy.md`
- `docs/calendar/sync-schema.md`
- `docs/calendar/writeback.md`
