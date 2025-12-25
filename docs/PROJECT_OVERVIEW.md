# LifeOS Project Overview

## What is LifeOS?

LifeOS is a personal productivity platform that combines a calendar-first planning system with projects, tasks, and daily reflection. The UI is a Vite + React SPA backed by Firebase Auth, Firestore, and Cloud Functions.

## Current State

### Implemented
- **Calendar**: canonical calendar model, recurrence engine, RSVP/attendees, Google sync + writeback
- **Todos**: projects/milestones/tasks, task detail + scheduling to calendar
- **Quotes**: deterministic daily quote, CRUD in settings
- **Today + Weekly Review**: daily overview and review workflow
- **Auth + Infrastructure**: Firebase Auth, Firestore persistence, Cloud Functions

### In Progress / Placeholder
- **Notes**: placeholder UI, domain work pending
- **People / Projects (CRM-style)**: placeholder UI

## Architecture Snapshot

- **Frontend**: Vite + React 19, React Router, custom hooks
- **Backend**: Firebase Auth + Firestore + Cloud Functions (Node 20)
- **Pattern**: domain/ports/usecases in packages, adapters in web app

## Project Structure

```
LifeOS_2/
├── apps/
│   └── web-vite/              # SPA
├── packages/
│   ├── calendar/              # Canonical calendar domain + recurrence
│   ├── todos/                 # Todo domain (ports + usecases)
│   ├── core/                  # Shared primitives
│   ├── sync-kit/              # Sync utilities
│   └── ...
├── functions/                 # Cloud Functions (sync/writeback)
├── docs/                      # Project docs
└── firebase.json
```

## Key Decisions

- **SPA over Next.js**: simplifies auth and local dev; works cleanly with Firebase Hosting
- **Canonical calendar model**: provider-agnostic core model (Google is an adapter)
- **Offline-first**: Firestore + outbox patterns for resilience
- **Monorepo**: shared domain code in `packages/*`

## Where to Start

- `docs/ARCHITECTURE.md` for system design
- `docs/DATA_MODELS.md` for Firestore schemas
- `docs/IMPLEMENTATION_PLAN.md` for roadmap
- `apps/web-vite/README.md` for UI details
