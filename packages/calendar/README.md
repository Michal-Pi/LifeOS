# @lifeos/calendar

Canonical calendar domain: models, recurrence, sync/writeback types, and use cases.

## Responsibilities

- Canonical event models and recurrence types
- Provider-agnostic sync/writeback structures
- Use cases for listing events and generating instances

## Public Surface

- `src/domain/models.ts` - canonical event and attendee types
- `src/domain/recurrence/*` - recurrence rules + instance generation
- `src/ports/*` - repository interfaces
- `src/usecases/*` - list events, recurrence expansion, writeback helpers
- `src/index.ts` - re-exports

## Notes

UI and Firestore adapters live in `apps/web-vite`. Cloud Functions use this package for Google sync/writeback.
