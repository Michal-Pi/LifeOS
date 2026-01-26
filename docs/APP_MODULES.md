# LifeOS Modules and Features

This document summarizes all app modules, their key features, and documentation coverage. It is
based on a repo-wide scan of existing Markdown docs plus a quick audit of active pages, packages,
and Cloud Functions.

## Documentation Inventory (Key Entry Points)

- `docs/INDEX.md` - doc index and navigation
- `README.md` - project overview and quick start
- `docs/PROJECT_OVERVIEW.md` - product scope and current state
- `docs/ARCHITECTURE.md` - architecture and data flow
- `docs/DATA_MODELS.md` - Firestore schema and canonical types
- `docs/TESTING_GUIDE.md` - test strategy
- `docs/firebase/` - Firebase setup, auth, secrets, hosting, emulator
- `docs/calendar/` - calendar sync and writeback
- `docs/todos/` - planner data model and UI details
- `docs/features/` - feature milestones and user guides
- `packages/*/README.md` - domain package specifics
- `apps/web-vite/README.md` - web client details

## App Modules (UI + Workflow Features)

### Today

- Daily dashboard with quotes, clock, status bar
- Highlights top priority tasks and "frog" task
- Calendar snapshot and time stats
- Habits check-ins, mind interventions, workout highlights

### Calendar

- Event CRUD, rich recurrence, RSVP and attendees
- Google Calendar sync, writeback, conflict-aware behavior
- Calendar settings panel and status indicators

### Planner (Projects/Chapters/Tasks)

- Projects, chapters, tasks with priority buckets
- Task detail sidebar and quick scheduling
- Markdown import and bulk task creation
- Offline sync support and timeline filters

### Projects (Insights)

- Project progress visualization
- Time allocation summaries
- Markdown import entry point

### Notes

- Notion-style block editor with rich formatting
- Backlinks, topics, and paragraph tagging
- Sync and conflict handling for notes

### Note Graph

- Visual graph of connected notes and topics

### Habits

- Habit creation and check-ins
- Streaks, completion stats, mood tracking

### Mind Engine

- Guided interventions and incantations
- Modal flows for sessions and check-ins

### Training

- Exercise library management
- Workout templates and workout plans
- Daily sessions and stats cards

### Agents

- Agent configuration, tools, and templates
- Workspace orchestration with runs
- Workflow graphs, run history, tool call timeline
- Expert Council execution and inspectors
- Prompt Library management and versioning
- Deep Research request queue and uploads

### Research

- Research queue UI with prompts and uploads
- Synthesis and completion tracking

### Weekly Review

- Habit analytics and weekly summaries

### Settings

- Provider keys and system status
- Agent memory defaults
- Quotes management and pinning
- Calendar settings and sync controls
- Theme settings

### Search

- Global search overlay for quick navigation

### Auth

- Login and sign-in flow (Firebase Auth)

### People (Placeholder)

- Placeholder module shell for future profiles/relationships

## Platform and Backend Modules

### Cloud Functions (functions/)

- Run execution and workflow orchestration
- Tool execution and tracking
- Expert Council pipeline
- Calendar sync and writeback jobs
- Quota tracking and rate limiting

### Domain Packages (packages/)

- `@lifeos/core`: shared utilities, IDs, quotes, logging
- `@lifeos/calendar`: canonical event models, recurrence, sync rules
- `@lifeos/todos`: projects/chapters/tasks data model and usecases
- `@lifeos/notes`: note models and sync logic
- `@lifeos/habits`: habits domain logic
- `@lifeos/mind`: interventions and session logic
- `@lifeos/training`: exercise/workout domain logic
- `@lifeos/agents`: agent/workspace/run models and orchestration usecases
- `@lifeos/sync-kit`: sync and conflict utilities
- `@lifeos/platform-web`: web platform helpers
- `@lifeos/agent-kit`: agent execution helpers (if used)

## Undocumented or Partially Documented Items (Gaps)

The following items exist in code but lack dedicated, up-to-date documentation:

- People module (currently a placeholder)
- Project Insights page (projects summary UI)
- Prompt Library UI workflow (separate from domain-level prompt docs)
- Global Search behavior and indexing scope
- In-app notifications and alert delivery UX
- Settings sections for quotes/pinning and theme scheduling
- Agents “Modules” area in the Agents page (tool modules)
- Projects page vs Planner page relationship and data flow

## Suggested Documentation Targets

- Add a short People module placeholder doc for roadmap context.
- Document Project Insights page in `docs/todos/`.
- Add a Prompt Library UI guide in `docs/features/`.
- Document Global Search behavior and supported entities.
- Add a Settings page overview with each panel’s intent.
