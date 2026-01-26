# LifeOS Web Client (Vite)

The LifeOS web client is the primary UI for calendar, tasks, and daily review. It is a Vite + React SPA backed by Firebase.

## Key Features

- Calendar month/week/agenda views
- Google Calendar sync + writeback
- Projects → chapters → tasks
- Task scheduling into calendar
- Project insights dashboard
- Daily quote + settings management
- Weekly review workflow
- Notes editor + note graph
- Habits + mind interventions
- Training module (exercise library, templates, plans)
- Agents (workspaces, runs, prompt library, research)
- Global search for tasks/projects/chapters

## Tech Stack

- React 19 + Vite
- React Router
- Firebase Auth + Firestore
- Vitest + Testing Library

## Local Setup

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm -C apps/web-vite build
```

## Environment

Create `apps/web-vite/.env.local` with Vite Firebase config:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

See `apps/web-vite/src/lib/firebase.ts` for loading logic.
