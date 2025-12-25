# LifeOS Quick Reference

## Current Status

- Calendar: production-ready (sync + writeback)
- Todos: active (projects/milestones/tasks)
- Quotes: active
- Notes/People/Projects: placeholder UI

## Commands

```bash
pnpm dev                         # Start web app
pnpm lint                        # Lint all packages
pnpm typecheck                   # Typecheck all packages
pnpm firebase:deploy             # Build + deploy hosting + functions
pnpm firebase:deploy:functions   # Build + deploy functions only
```

## App Entry Points

- Web app: `apps/web-vite/src`
- Functions: `functions/src`
- Calendar domain: `packages/calendar/src`
- Todos domain: `packages/todos/src`

## Firestore Collections (high-level)

- `quotes/{userId}`
- `users/{userId}/calendarEvents`
- `users/{userId}/calendars`
- `users/{userId}/calendarSyncState`
- `users/{userId}/compositeEvents`
- `users/{userId}/projects`
- `users/{userId}/milestones`
- `users/{userId}/tasks`

See `docs/DATA_MODELS.md` for details.

## Environment Variables (Vite)

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Useful Docs

- `docs/ARCHITECTURE.md`
- `docs/DATA_MODELS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `DEPLOYMENT.md`
