# @lifeos/sync-kit

`@lifeos/sync-kit` defines synchronization helpers, models, and ports used across modules. It keeps synced state primitives independent of browser or native APIs.

## Responsibilities
- Define portable sync primitives (sync jobs, change trackers).
- Publish ports that adapters can implement to persist or replay changes.
- Export helper types used by other modules while keeping no platform-specific dependencies.

## Non-responsibilities
- No React, Next, or browser APIs.
- No direct implementation of network/storage; those live in adapters.

## Structure
- `src/domain` holds sync state models.
- `src/usecases` holds pure orchestration logic that depends on ports.
- `src/ports` defines the adapter interfaces.
- `src/adapters` can hold shared helpers for adapters.
- `src/index.ts` re-exports the public API.
