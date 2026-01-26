# LifeOS Quick Reference

## Current Status

- Calendar: production-ready (sync + writeback)
- Todos: active (projects/chapters/tasks)
- Notes: active (late beta)
- Habits + Mind: active
- Training: active
- Agents: active (workspaces, runs, prompt library)
- Quotes: active
- People: placeholder UI

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

## Key Routes

- `/today` - daily dashboard
- `/calendar` - calendar UI
- `/planner` - projects/chapters/tasks
- `/projects` - project insights
- `/notes` - notes editor
- `/notes/graph` - note graph
- `/habits` - habits dashboard
- `/exercises` - exercise library
- `/templates` - workout templates
- `/plan` - workout plan
- `/agents` - agents + tools
- `/agents/prompts` - prompt library
- `/workspaces` - workspaces and runs
- `/agents/research` - deep research queue
- `/settings` - system settings

## Global Search

- Current scope: projects, chapters, and tasks
- Accessed from top nav or the sidebar search overlay
- Planned: notes, calendar events, and agent runs

## Settings Highlights

- Provider keys (OpenAI, Anthropic, Google, xAI)
- Agent memory defaults
- Quote library management and pinning
- Calendar sync and status panels

## Firestore Collections (high-level)

- `quotes/{userId}`
- `users/{userId}/calendarEvents`
- `users/{userId}/calendars`
- `users/{userId}/calendarSyncState`
- `users/{userId}/compositeEvents`
- `users/{userId}/projects`
- `users/{userId}/chapters`
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
