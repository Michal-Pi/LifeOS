# @lifeos/core

`@lifeos/core` hosts the shared primitives used across modules: IDs, clocks, typed event buses, and schemas.

## Responsibilities
- Provide typed IDs, ISO timestamps, and helper utilities that remain runtime-agnostic.
- Define typed bus/event helpers for intra-app communication.
- Export shared schema helpers (e.g., Zod wrappers) used by other packages.

## Non-responsibilities
- No UI, React, or browser API usage.
- No knowledge of platform-specific adapters.

## Public API
- `src/id.ts`, `src/time.ts`, `src/eventBus.ts`, and `src/schema.ts` compose the exported surface.
