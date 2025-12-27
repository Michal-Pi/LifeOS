# LifeOS

LifeOS is a personal productivity and knowledge management system built as a Vite + React SPA with Firebase for auth, data, and serverless functions.

## Vision

LifeOS helps you organize daily work and long-term goals through:

- Calendar-first planning with Google sync
- Project/milestone/task management
- Daily overview + weekly review
- Quote-based inspiration
- Notes and knowledge capture (in progress)

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the web app (Vite)
pnpm dev

# Typecheck / lint
pnpm typecheck
pnpm lint

# Deploy (builds everything then deploys)
pnpm firebase:deploy
```

## Documentation

Start here:

- `docs/INDEX.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODELS.md`
- `DEPLOYMENT.md`

## Current Features

### Calendar

- Event CRUD + rich recurrence
- Instances + overrides
- RSVP + attendees
- Permission-aware behavior
- Google Calendar bidirectional sync
- Offline-first patterns + outbox

### Todos (Projects/Milestones/Tasks)

- Hierarchical project → milestone → task model
- Task detail sidebar + scheduling into calendar
- Priority/urgency/importance support
- Firestore-backed persistence

### Habits & Mind Engine

- **Habit Tracking**: Create habits with flexible schedules, track check-ins with mood before/after, view progress with streaks and completion rates
- **Mind Interventions**: Pre-built interventions (breathing, grounding, ROAM, etc.) with step-by-step guidance including text, timers, choices, and input prompts
- **Analytics Dashboard**: Weekly review with habit completion trends, mood correlation analysis, and intervention effectiveness tracking
- **Domain-Driven Architecture**: Clean separation between UI (React hooks), business logic (usecases), and data access (repositories)

### Today + Review

- Today dashboard with quick stats
- Weekly review page with habit analytics
- Mood tracking and correlation insights

### Quotes

- Deterministic daily quote selection
- Quote CRUD in settings

### Platform + Infrastructure

- Firebase Auth (Google Sign-In)
- Firestore persistence
- Cloud Functions for sync/writeback
- pnpm + Turbo monorepo
- Clean Architecture with usecases layer for testable business logic

## Tech Stack

**Frontend**

- Vite + React 19 + TypeScript
- React Router
- Custom hooks + repository adapters

**Backend**

- Firebase Auth
- Firestore
- Cloud Functions (Node 20)

**Infra**

- pnpm workspaces
- Turbo
- Vitest

## Project Structure (Top Level)

```
LifeOS_2/
├── apps/
│   └── web-vite/        # Vite SPA
├── packages/            # Domain packages (calendar, todos, etc.)
├── functions/           # Cloud Functions
├── docs/                # Core documentation
├── firebase.json        # Firebase config
└── firestore.rules      # Firestore security rules
```

## Environment Setup

The web app uses Vite environment variables:

```
apps/web-vite/.env.local
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

See `DEPLOYMENT.md` for production deploy details.

## Common Commands

```bash
pnpm dev                         # Start Vite dev server
pnpm lint                        # Lint all packages
pnpm typecheck                   # Typecheck all packages
pnpm firebase:deploy             # Build + deploy hosting + functions
pnpm firebase:deploy:functions   # Build + deploy functions only
```

## Status

- Calendar: production-ready
- Todos: active and in use
- Habits & Mind Engine: production-ready with analytics (Phase 5 complete)
- Notes: late beta with offline support and OKR integration
- Training: foundation complete, workout planning in progress
- People/Projects: placeholder UI

## Architecture

LifeOS follows Clean Architecture principles:

- **Domain Layer**: Pure business logic in `@lifeos/habits`, `@lifeos/mind`, `@lifeos/calendar` packages
- **Usecases Layer**: Testable business operations that orchestrate repositories
- **Adapters Layer**: Firestore implementations of repository interfaces
- **UI Layer**: React components and hooks that delegate to usecases

This separation enables:

- Unit testing business logic without React dependencies
- Reusable domain logic across different UI implementations
- Clear boundaries between concerns
- Type-safe data flow from domain to UI

---

Built with Firebase + Vite + TypeScript.
