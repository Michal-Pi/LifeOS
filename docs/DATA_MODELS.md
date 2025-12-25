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
users/{userId}/milestones/{milestoneId}
users/{userId}/tasks/{taskId}
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

## Todos (Projects / Milestones / Tasks)

Types live in `apps/web-vite/src/types/todo.ts`.

Collections:
- `users/{userId}/projects`
- `users/{userId}/milestones`
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

interface CanonicalMilestone {
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

Placeholder UI exists; data models are pending and will be added to this document when implemented.
