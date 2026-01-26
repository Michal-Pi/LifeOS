# LifeOS Onboarding Guide

Welcome to LifeOS. This guide covers setup, local development, data model orientation, and core
workflows. It links to the rest of the documentation for deeper dives.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Start the web app:

```bash
pnpm dev
```

3. Optional checks:

```bash
pnpm typecheck
pnpm lint
```

## Prerequisites

- Node.js (project expects Node 20, newer versions may warn)
- pnpm
- Firebase project (Auth + Firestore + Functions)

## Environment Setup

Create `apps/web-vite/.env.local`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

See `docs/firebase/overview.md` and `DEPLOYMENT.md` for Firebase config details.

## Repo Structure (High Level)

```
apps/
  web-vite/            # React app (Vite)
functions/             # Firebase Cloud Functions
packages/              # Domain packages (calendar, todos, agents, etc.)
docs/                  # Documentation
```

## Core Concepts

- **Domain packages** hold business logic and canonical models.
- **Adapters** provide Firestore persistence.
- **Hooks** are the UI entry points for usecases.
- **Cloud Functions** handle background orchestration and provider integrations.

See `docs/ARCHITECTURE.md` and `docs/DATA_MODELS.md`.

## App Navigation

- Today: daily summary + tasks + calendar snapshot
- Calendar: events, recurrence, and sync
- Planner: projects/chapters/tasks
- Notes: block editor, topics, backlinks
- Habits + Mind: tracking and interventions
- Training: exercise library and workout flows
- Agents: AI agents, workspaces, runs, research
- Settings: provider keys, memory defaults, quotes, calendar settings

Full module list: `docs/APP_MODULES.md`

## Data and Firestore

LifeOS stores all user data under `users/{userId}/...` with module-specific subcollections. See
`docs/DATA_MODELS.md` for canonical structures and `docs/firebase/` for rules/emulators.

## Working with Agents

- Configure agents in `/agents`
- Create workspaces and run orchestrations in `/workspaces`
- Inspect runs for tool calls, workflow steps, and Expert Council
- Use the Prompt Library at `/agents/prompts`
- Manage Deep Research in `/agents/research`

Related docs:

- `docs/features/expert-council-user-guide.md`
- `docs/features/project-manager-user-guide.md`
- `docs/features/deep-research-user-guide.md`
- `docs/features/writing-agents-guide.md`

## Testing

Refer to `docs/TESTING_GUIDE.md` for recommended suites and conventions.

## Deploying

- `pnpm firebase:deploy` (full deploy)
- `pnpm firebase:deploy:functions` (functions only)

See `DEPLOYMENT.md` and `docs/DEPLOY_SCRIPTS.md`.

## Troubleshooting

- If functions builds fail, rebuild vendored packages:
  - `pnpm --filter @lifeos/core build`
  - `pnpm --filter @lifeos/agents build`
  - Re-run functions build or deploy scripts
- For auth or emulator issues, review `docs/firebase/` guides.

## Where to Learn More

- `docs/INDEX.md` for the doc map
- `docs/PROJECT_OVERVIEW.md` for current status
- `packages/*/README.md` for domain specifics
