# Notes Sync

Notes use a local-first model backed by IndexedDB and a Firestore adapter. Sync is handled by a background worker that pushes local outbox operations and then pulls remote changes.

## Components

- `apps/web-vite/src/notes/offlineStore.ts`
- `apps/web-vite/src/notes/noteOutbox.ts`
- `apps/web-vite/src/notes/syncWorker.ts`
- `apps/web-vite/src/hooks/useNoteSync.ts`
- Firestore adapters: `apps/web-vite/src/adapters/notes/`

## Local Storage

```
Database: lifeos-notes (v1)
Stores: notes, topics, sections

Database: lifeos-note-outbox (v1)
Stores: note-operations, topic-operations, section-operations
```

## Sync Cycle

```
Local edit -> outbox op
  -> syncWorker processes ops (create/update/delete)
  -> Firestore write
  -> local store updated with synced version
  -> pull remote changes (last-write-wins)
```

## Conflict Handling

- Notes: last-write-wins based on `updatedAtMs`
- Outbox ops are retried with backoff on failure
- Applied ops are cleaned after 24 hours

## Failure Modes

- Offline: ops remain pending until connection restores
- Firestore errors: op marked failed, retried later
- Remote deletes: local synced note removed if missing remotely

## Related Docs

- `docs/DATA_MODELS.md`
