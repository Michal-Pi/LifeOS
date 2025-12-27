# LifeOS Project Overview

## What is LifeOS?

LifeOS is a comprehensive personal productivity platform that unifies calendar management, task organization, and knowledge capture into a single offline-first system. Built with a Vite + React SPA backed by Firebase Auth, Firestore, and Cloud Functions.

## Current State

### Fully Implemented Systems

#### 1. Calendar System

**Status**: ✅ Production-ready (recently refactored from 773 → 440 lines)

**Core Features**:

- **Canonical Calendar Model**: Provider-agnostic event representation
- **Recurrence Engine**: RFC 5545 compliant via rrule library
- **Google Calendar Sync**: Bidirectional sync with full writeback support
- **RSVP & Attendees**: Multi-attendee event management
- **Alert System**: Event notifications with dismissal tracking
- **Offline-First**: IndexedDB storage with sync queue pattern

**Architecture**:

- `@lifeos/calendar` package: Domain models, recurrence logic, validation
- Repository pattern with Firestore and IndexedDB adapters
- Outbox pattern for offline operations
- Cloud Functions for Google Calendar integration

**Key Components**:

- [CalendarPage.tsx](../apps/web-vite/src/pages/CalendarPage.tsx) - Main calendar interface
- [useCalendarEvents.ts](../apps/web-vite/src/hooks/useCalendarEvents.ts) - Event data loading + instances
- [useEventOperations.ts](../apps/web-vite/src/hooks/useEventOperations.ts) - Event CRUD + writeback
- [useEventAlerts.ts](../apps/web-vite/src/hooks/useEventAlerts.ts) - Alert scheduling and management
- [useAutoSync.ts](../apps/web-vite/src/hooks/useAutoSync.ts) - Background sync trigger
- [CalendarViewsContainer.tsx](../apps/web-vite/src/components/calendar/CalendarViewsContainer.tsx) - Month/week/day/agenda views + recurrence rendering
- [EventModalsContainer.tsx](../apps/web-vite/src/components/calendar/EventModalsContainer.tsx) - Recurring edit scope selection + modals

**Data Models**:

- `CanonicalCalendarEvent` - Core event structure with source tracking
- `RecurrencePattern` - Recurrence rules (RRULE format)
- `RecurrenceInstance` - Individual occurrences of recurring events
- `AlertDismissal` - Alert state and dismissal tracking

**Test Coverage**: Domain and recurrence tests in:

- `packages/calendar/src/domain/__tests__/models.test.ts`
- `packages/calendar/src/domain/__tests__/composite.test.ts`
- `packages/calendar/src/domain/recurrence/__tests__/generateInstances.test.ts`
- `packages/calendar/src/domain/recurrence/__tests__/parseGoogleRecurrence.test.ts`
- `packages/calendar/src/usecases/__tests__/eventUsecases.test.ts`

**Recent Improvements**:

- Phase 1: Extracted event management to `useCalendarEvents` hook
- Phase 2: Extracted sync trigger to `useAutoSync` and writeback to `useEventOperations`
- Phase 3: Extracted view state management
- Phase 4: Extracted alert system to `useEventAlerts` hook
- Result: 43.1% reduction in CalendarPage complexity (773 → 440 lines)

---

#### 2. Todo System

**Status**: ✅ Production-ready with full feature set

**Core Features**:

- **Hierarchical Task Management**: Projects → Milestones → Tasks
- **Priority Levels**: Top, high, medium, low priority categorization
- **Due Date Management**: Date-based task scheduling
- **Calendar Integration**: Schedule tasks to calendar slots
- **Project Associations**: Link tasks to projects and milestones
- **Completion Tracking**: Mark tasks complete with timestamps
- **Offline-First**: Firestore + IndexedDB with real-time sync

**Architecture**:

- `@lifeos/todos` package: Domain models, usecases, validation
- Repository pattern with Firestore adapters
- Ports and adapters architecture
- Real-time sync with Firestore listeners

**Key Components**:

- [TodosPage.tsx](../apps/web-vite/src/pages/TodosPage.tsx) - Task list and management interface
- [TodoPage.tsx](../apps/web-vite/src/pages/TodoPage.tsx) - Individual task detail view
- [useTodoOperations.ts](../apps/web-vite/src/hooks/useTodoOperations.ts) - Todo CRUD operations hook
- [TopPriorityTodos.tsx](../apps/web-vite/src/components/TopPriorityTodos.tsx) - Priority task widget
- Todo adapters in `apps/web-vite/src/adapters/`

**Data Models**:

- `Todo` - Core task structure with:
  - Priority levels (top, high, medium, low)
  - Due dates and timestamps
  - Completion state
  - Project/milestone associations
  - Tags and metadata
- `Project` - Project container for organizing tasks
- `Milestone` - Project milestone with associated tasks

**Domain Logic** (in `@lifeos/todos` package):

- Task validation rules
- Priority management
- Due date calculations
- Project hierarchy management
- Completion tracking

**Test Coverage**:

- `apps/web-vite/src/lib/__tests__/todoRules.test.ts`
- `apps/web-vite/src/lib/__tests__/todoUi.test.ts`
- `apps/web-vite/src/lib/__tests__/priority.test.ts`

---

#### 3. Supporting Systems

**Quotes System**:

- Deterministic daily quote generation
- CRUD operations in settings
- Quote rotation algorithm

**Today View**:

- Daily overview with top priorities
- Calendar events for the day
- Task planning interface

**Weekly Review**:

- Weekly reflection workflow
- Progress tracking
- Goal review

**Auth & Infrastructure**:

- Firebase Authentication
- Firestore for data persistence
- Cloud Functions for backend operations
- Firebase Hosting for deployment

---

### In Progress / Planned

#### Notes System

**Status**: 🟡 Late beta (close to GA)

**Overview**: Offline-capable notes + learning management with TipTap content and sync pipeline

**Key Features** (current/near GA):

- TipTap rich text editor with ProseMirror
- LaTeX math notation via KaTeX
- Images and tables
- Hierarchical organization: Topics → Sections → Notes
- Project and OKR integration
- Learning projects with milestones
- Offline-first with IndexedDB + outbox

**Documentation**:

- [Complete 8-week implementation plan](./features/learning-notes-plan.md)
- [Getting started guide](./features/GETTING_STARTED.md)
- [Notes package README](../packages/notes/README.md)

**Timeline**: Implementation in late beta; remaining polish + tests

---

#### People / Projects (CRM-style)

**Status**: 🔲 Placeholder UI only

**Planned Features**:

- Contact management
- Relationship tracking
- Project collaboration
- Meeting notes and follow-ups

---

## Architecture Snapshot

### Frontend

- **Framework**: Vite + React 19
- **Routing**: React Router v6
- **State Management**: React hooks + custom hooks
- **Styling**: CSS modules + Tailwind (planned)
- **Offline Storage**: IndexedDB via idb library

### Backend

- **Authentication**: Firebase Auth
- **Database**: Firestore (NoSQL)
- **Functions**: Cloud Functions (Node 20, ES modules)
- **Storage**: Firebase Storage (for attachments)
- **Hosting**: Firebase Hosting

### Architectural Patterns

- **Domain-Driven Design**: Domain logic in `packages/*`
- **Ports & Adapters**: Abstract repositories, concrete adapters
- **Offline-First**: Outbox pattern for sync queue
- **Repository Pattern**: Firestore + IndexedDB implementations
- **Monorepo**: Shared packages via pnpm workspaces

---

## Project Structure

```
LifeOS_2/
├── apps/
│   └── web-vite/                    # React SPA
│       ├── src/
│       │   ├── pages/               # Page components
│       │   │   ├── CalendarPage.tsx # Calendar interface (440 lines)
│       │   │   ├── TodosPage.tsx    # Todo list
│       │   │   ├── TodoPage.tsx     # Todo detail
│       │   │   └── TodayPage.tsx    # Daily overview
│       │   ├── hooks/               # Custom React hooks
│       │   │   ├── useCalendarEvents.ts
│       │   │   ├── useEventAlerts.ts
│       │   │   ├── useAutoSync.ts
│       │   │   └── useEventOperations.ts
│       │   │   └── useTodoOperations.ts
│       │   ├── components/          # Reusable components
│       │   │   ├── calendar/        # Calendar components
│       │   │   └── TopPriorityTodos.tsx
│       │   ├── adapters/            # Firestore/IndexedDB adapters
│       │   ├── outbox/              # Offline sync queue
│       │   └── lib/                 # Utilities
│       └── package.json
│
├── packages/
│   ├── calendar/                    # Calendar domain package
│   │   ├── src/
│   │   │   ├── domain/              # Core models
│   │   │   │   ├── models.ts        # CanonicalCalendarEvent
│   │   │   │   ├── recurrence/      # Recurrence logic
│   │   │   │   └── validation.ts    # Validation rules
│   │   │   ├── repositories/        # Abstract repositories
│   │   │   └── usecases/            # Business logic
│   │   └── package.json
│   │
│   ├── todos/                       # Todo domain package
│   │   ├── src/
│   │   │   ├── domain/              # Todo models
│   │   │   ├── ports/               # Repository interfaces
│   │   │   └── usecases/            # Todo operations
│   │   └── package.json
│   │
│   ├── core/                        # Shared primitives
│   │   └── src/
│   │       ├── types/               # Common types
│   │       └── utils/               # Utilities
│   │
│   └── sync-kit/                    # Sync utilities
│       └── src/
│           └── outbox/              # Outbox pattern
│
├── functions/                       # Cloud Functions
│   ├── src/
│   │   ├── calendar/                # Calendar sync
│   │   │   └── googleCalendarSync.ts
│   │   └── index.ts
│   ├── prepare-deploy.sh            # Deployment script
│   └── package.json
│
├── docs/                            # Documentation
│   ├── PROJECT_OVERVIEW.md          # This file
│   ├── ARCHITECTURE.md              # System architecture
│   ├── DATA_MODELS.md               # Data schemas
│   ├── DEPLOYMENT.md                # Deployment guide
│   ├── features/                    # Feature plans
│   │   ├── learning-notes-plan.md   # Notes implementation
│   │   └── GETTING_STARTED.md       # Notes quick start
│   └── refactoring/                 # Refactoring reports
│       └── build-fixes-completion-report.md
│
├── firebase.json                    # Firebase configuration
├── firestore.rules                  # Security rules
├── firestore.indexes.json           # Database indexes
├── pnpm-workspace.yaml              # Monorepo config
├── turbo.json                       # Build orchestration
└── package.json                     # Root package
```

---

## Key Technical Decisions

### SPA over Next.js

- **Rationale**: Simplifies Firebase Auth integration
- **Benefit**: Cleaner local development without SSR complexity
- **Trade-off**: No server-side rendering (acceptable for productivity app)

### Canonical Calendar Model

- **Rationale**: Provider-agnostic core representation
- **Benefit**: Can integrate multiple calendar providers (Google, Outlook, etc.)
- **Implementation**: Google Calendar is just one adapter

### Offline-First Architecture

- **Rationale**: Users need to work without internet
- **Implementation**: IndexedDB + Firestore with outbox pattern
- **Benefit**: Resilient to network failures

### Monorepo Structure

- **Rationale**: Share domain logic across frontend/backend
- **Tool**: pnpm workspaces + Turbo
- **Benefit**: Type-safe sharing of models and logic

### Domain-Driven Design

- **Rationale**: Separate business logic from infrastructure
- **Pattern**: Domain models in `packages/`, adapters in `apps/`
- **Benefit**: Testable, portable business logic

---

## Firestore Collections

### Calendar Data

```
/users/{userId}/calendarEvents/{eventId}
/users/{userId}/eventInstances/{instanceId}
/users/{userId}/googleCalendarMeta/{metaId}
```

### Todo Data

```
/users/{userId}/todos/{todoId}
/users/{userId}/projects/{projectId}
/users/{userId}/milestones/{milestoneId}
```

### Notes Data (planned)

```
/users/{userId}/notes/{noteId}
/users/{userId}/topics/{topicId}
/users/{userId}/sections/{sectionId}
/users/{userId}/attachments/{attachmentId}
```

### User Data

```
/users/{userId}/profile
/users/{userId}/settings
/users/{userId}/quotes/{quoteId}
```

---

## Development Workflow

### Installation

```bash
pnpm install
```

### Development Server

```bash
# Web app
pnpm --filter web-vite dev

# Functions emulator
pnpm --filter functions dev
```

### Quality Checks

```bash
# Lint all packages
pnpm turbo lint

# Type check all packages
pnpm turbo typecheck

# Run tests
pnpm turbo test

# Build all packages
pnpm turbo build
```

### Deployment

```bash
# Deploy functions and hosting
pnpm firebase:deploy

# Or deploy separately
pnpm firebase:deploy:functions
pnpm firebase:deploy:hosting
```

---

## Testing Strategy

### Calendar System

- **Unit Tests**: Domain logic, recurrence rules, validation
- **Files**:
  - `packages/calendar/src/domain/__tests__/models.test.ts`
  - `packages/calendar/src/domain/__tests__/composite.test.ts`
  - `packages/calendar/src/domain/recurrence/__tests__/generateInstances.test.ts`
  - `packages/calendar/src/domain/recurrence/__tests__/parseGoogleRecurrence.test.ts`
  - `packages/calendar/src/usecases/__tests__/eventUsecases.test.ts`

### Todo System

- **Unit Tests**: Todo rules + priority logic
- **Files**:
  - `apps/web-vite/src/lib/__tests__/todoRules.test.ts`
  - `apps/web-vite/src/lib/__tests__/priority.test.ts`
- **UI Tests**:
  - `apps/web-vite/src/lib/__tests__/todoUi.test.ts`
  - `apps/web-vite/src/hooks/__tests__/useTodoOperations.test.tsx`

### Target Coverage

- **Goal**: >80% coverage for domain packages
- **Focus**: Business logic over UI components

---

## Recent Accomplishments

### Calendar Refactoring (Phases 1-4)

- **Before**: 773 lines in CalendarPage.tsx
- **After**: 440 lines (43.1% reduction)
- **Method**: Extracted custom hooks (events, operations, views, alerts, auto-sync)
- **Result**: Improved testability, maintainability, separation of concerns

### Build & Deployment Fixes

- Fixed rrule ESM module resolution (deployment blocker)
- Fixed Firebase workspace: dependencies for Cloud Build
- Fixed React Fast Refresh lint errors
- All quality checks passing (lint, typecheck, build)

### Documentation

- Created comprehensive Learning/Notes 8-week plan
- Created getting started guide for Notes Phase 1
- Documented build fixes and deployment process
- Created this project overview

---

## Where to Start

### For New Developers

1. Read this overview
2. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
3. Review [DATA_MODELS.md](./DATA_MODELS.md) for schemas
4. Run `pnpm install` and start dev server

### For Feature Development

1. Review [features/learning-notes-plan.md](./features/learning-notes-plan.md) for next steps
2. Follow [features/GETTING_STARTED.md](./features/GETTING_STARTED.md) for Phase 1
3. Maintain domain logic in `packages/`
4. Add adapters in `apps/web-vite/src/adapters/`

### For Debugging

1. Check [refactoring/build-fixes-completion-report.md](./refactoring/build-fixes-completion-report.md)
2. Review [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues
3. Use browser DevTools for IndexedDB inspection
4. Check Firebase Console for Firestore data

---

## Success Metrics

### Performance

- ✅ CalendarPage: <100ms time-to-interactive
- ✅ Offline mode: Works without network
- ✅ Sync: <5s for 100 events

### Code Quality

- ✅ All lint checks passing
- ✅ All type checks passing
- ✅ Build succeeds without errors
- ✅ >80% test coverage for calendar and todos

### User Experience

- ✅ Offline-first: No data loss
- ✅ Real-time sync: Updates across devices
- ✅ Intuitive UI: Clear navigation and feedback

---

## Next Steps

### Immediate (This Week)

1. ✅ Complete CalendarPage refactoring
2. ✅ Fix all build and deployment issues
3. ✅ Create Learning/Notes implementation plan
4. ✅ Set up git repository with proper .gitignore

### Short Term (Next 2-4 Weeks)

1. Start Notes Phase 1: Data models and repositories
2. Add TipTap editor dependencies
3. Create IndexedDB schema for notes
4. Implement basic note CRUD operations

### Medium Term (2-3 Months)

1. Complete Notes implementation (Phases 1-8)
2. Add People/CRM features
3. Enhance project management
4. Mobile responsive improvements

---

**Last Updated**: 2025-12-25
**Version**: 1.0
**Status**: Production-ready for Calendar and Todos, Planning complete for Notes
