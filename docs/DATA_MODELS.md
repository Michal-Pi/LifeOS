# LifeOS Data Models

Source of truth is the domain types in `packages/*` and `apps/web-vite/src/types`.

## Firestore Layout

```
quotes/{userId}
users/{userId}/calendarEvents/{eventId}
users/{userId}/calendars/{calendarId}
users/{userId}/calendarSyncState/{stateKey}
users/{userId}/compositeEvents/{compositeId}
users/{userId}/projects/{projectId}
users/{userId}/chapters/{chapterId}
users/{userId}/tasks/{taskId}
users/{userId}/notes/{noteId}
users/{userId}/topics/{topicId}
users/{userId}/sections/{sectionId}
users/{userId}/attachments/{attachmentId}
users/{userId}/habits/{habitId}
users/{userId}/habitCheckins/{checkinId}
users/{userId}/incantations/{incantationId}
interventions/{interventionId} (system presets)
users/{userId}/interventions/{interventionId}
users/{userId}/intervention_sessions/{sessionId}
users/{userId}/workoutSessions/{sessionId}
```

## Quotes

Collection: `quotes/{userId}`

```ts
interface Quote {
  id: string
  text: string
  author: string
  createdAt: string
  updatedAt: string
  order: number
}

interface QuoteCollection {
  userId: string
  quotes: Quote[]
  updatedAt: string
}
```

## Calendar

Canonical types live in `packages/calendar/src/domain/models.ts`.

Collections:

- `users/{userId}/calendarEvents` (canonical events)
- `users/{userId}/calendars` (calendar metadata)
- `users/{userId}/calendarSyncState` (sync tokens)
- `users/{userId}/compositeEvents` (composite scheduling)

Key event fields (subset):

```ts
interface CanonicalCalendarEvent {
  canonicalEventId: string
  providerRef: {
    provider: string
    accountId: string
    providerCalendarId: string
    providerEventId?: string
    recurringEventId?: string
    etag?: string
  }
  startMs: number
  endMs: number
  startIso: string
  endIso: string
  title?: string
  description?: string
  location?: string
  timezone?: string
  allDay?: boolean
  attendees?: CanonicalAttendee[]
  recurrenceV2?: RecurrenceV2
  syncState: string
  createdAt: string
  updatedAt: string
  createdAtMs: number
  updatedAtMs: number
}
```

See `packages/calendar/src/domain/models.ts` and `packages/calendar/src/domain/recurrence/types.ts` for full definitions.

## Todos (Projects / Chapters / Tasks)

Types live in `apps/web-vite/src/types/todo.ts`.

Collections:

- `users/{userId}/projects`
- `users/{userId}/chapters`
- `users/{userId}/tasks`

```ts
interface CanonicalProject {
  id: string
  userId: string
  title: string
  domain: 'work' | 'projects' | 'life' | 'learning' | 'wellbeing'
  createdAt: string
  updatedAt: string
  archived: boolean
}

interface CanonicalChapter {
  id: string
  projectId: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
  archived: boolean
}

interface CanonicalTask {
  id: string
  userId: string
  title: string
  domain: 'work' | 'projects' | 'life' | 'learning' | 'wellbeing'
  importance: 1 | 2 | 4 | 7 | 10
  status: 'inbox' | 'next_action' | 'waiting_for' | 'scheduled' | 'someday' | 'done' | 'cancelled'
  completed: boolean
  createdAt: string
  updatedAt: string
}
```

## Notes / People / Projects (CRM)

Notes are implemented (late beta). People and Projects remain placeholder modules.

### Notes Collections

- `users/{userId}/notes`
- `users/{userId}/topics`
- `users/{userId}/sections`
- `users/{userId}/attachments`

Key note fields (subset):

```ts
interface Note {
  noteId: string
  userId: string
  title: string
  content: object
  contentHtml?: string
  topicId: string | null
  sectionId: string | null
  projectIds: string[]
  okrIds: string[]
  tags: string[]
  createdAtMs: number
  updatedAtMs: number
  lastAccessedAtMs: number
  syncState: 'synced' | 'pending' | 'conflict'
  version: number
  attachmentIds: string[]
}
```

Attachments store metadata in Firestore and file data in Storage at:

```
users/{userId}/attachments/{attachmentId}
```

### Local Notes Storage (IndexedDB)

Notes use IndexedDB for offline storage and outbox operations:

```
Database: lifeos-notes (v1)
Stores: notes, topics, sections

Database: lifeos-note-outbox (v1)
Stores: note-operations, topic-operations, section-operations
```

See `apps/web-vite/src/notes/offlineStore.ts` and `apps/web-vite/src/notes/noteOutbox.ts`.

## Habits

Collections:

- `users/{userId}/habits`
- `users/{userId}/habitCheckins`
- `users/{userId}/incantations`

Key habit fields (subset):

```ts
interface CanonicalHabit {
  habitId: string
  title: string
  domain: string
  status: 'active' | 'paused' | 'archived'
  anchor: object
  recipe: object
  schedule: { daysOfWeek: number[]; timezone: string }
  safetyNet: object
  calendarProjection?: object
  createdAtMs: number
  updatedAtMs: number
  syncState: 'synced' | 'pending' | 'conflict'
  version: number
}
```

See `packages/habits/src/domain/models.ts` for full definitions.

## Mind

Collections:

- `interventions` (system presets, userId = 'system')
- `users/{userId}/interventions`
- `users/{userId}/intervention_sessions`

Key preset/session fields (subset):

```ts
interface CanonicalInterventionPreset {
  interventionId: string
  type: string
  title: string
  steps: object[]
  recommendedForFeelings: string[]
  createdAtMs: number
  updatedAtMs: number
  syncState: 'synced' | 'pending' | 'conflict'
  version: number
}
```

See `packages/mind/src/domain/models.ts` for full definitions.

## Training

Collections:

- `users/{userId}/workoutSessions`

Key session fields (subset):

```ts
interface WorkoutSession {
  sessionId: string
  dateKey: string
  context: string
  status: 'planned' | 'in_progress' | 'completed' | 'skipped'
  items: object[]
  createdAtMs: number
  updatedAtMs: number
  syncState: 'synced' | 'pending' | 'conflict'
  version: number
}
```

Additional models (exercise library, templates, plans) are defined in
`packages/training/src/domain/models.ts` but are not yet wired to Firestore.
