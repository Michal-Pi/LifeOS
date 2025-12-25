# LifeOS Architecture

## Overview

LifeOS is a Vite + React SPA backed by Firebase Auth, Firestore, and Cloud Functions. Domain logic lives in `packages/*` and is consumed by adapters in `apps/web-vite`.

## Layers

1. **Domain packages** (`packages/*`)
   - Pure types + use cases
   - No UI or platform APIs

2. **Web app** (`apps/web-vite`)
   - React UI, hooks, and adapters
   - Firestore repositories

3. **Cloud Functions** (`functions/`)
   - Calendar sync, writeback, and OAuth flows

## Data Flow (Calendar Example)

```
UI → hook → repository (Firestore) → canonical event
                     ↘︎ functions (sync/writeback)
```

## Key Patterns

- **Repository pattern** for persistence
- **Canonical domain models** (calendar, todos)
- **Offline-first** (outbox + conflict handling)

## Deployment Topology

```
Browser (Vite SPA) → Firebase Hosting
                 → Firestore (client SDK)
                 → Cloud Functions (HTTPS)
```

## Future Considerations

- Multi-provider calendar support
- Notes editor + search
- Performance tuning (manual chunks, list virtualization)
