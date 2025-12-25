# Calendar Sync Schema (Current + Planned)

This document captures the current Firestore layout for calendar sync and the
planned additions for per-calendar sync settings and sync state tracking.

## Current Collections (Observed)

```
users/{uid}/
  calendarAccounts/{accountId}
    - provider
    - status
    - lastSyncAt
    - lastSuccessAt
    - updatedAt

  privateIntegrations/google/googleAccounts/{accountId}
    - refreshToken
    - accessToken
    - expiryDate
    - scope
    - tokenType
    - updatedAt
    - lastIssuedAt
    - status

  calendars/{calendarId}
    - calendarId
    - name
    - description
    - owner
    - accessRole
    - canWrite
    - isPrimary
    - color
    - foregroundColor
    - timeZone
    - providerMeta
    - visible
    - selected
    - createdAt
    - updatedAt

  calendarEvents/{canonicalEventId}
    - canonicalEventId
    - providerRef
    - calendarId
    - title
    - startMs / endMs / startIso / endIso
    - recurrence / recurrenceV2
    - attendees / organizer / selfAttendee
    - syncState / writebackError / lastWritebackAtMs
    - source
    - occursOn

  calendarWritebackQueue/{jobId}
    - status
    - op
    - payload
    - attempts
    - availableAtMs

  calendarSyncState/{accountId}
    - lastSyncAt
    - lastSuccessAt
    - lastError

  calendarSyncRuns/{runId}
    - runId
    - status
    - mode
    - counts
    - errors

  recurrenceInstanceMap/{seriesId}
    - occurrences{ occurrenceKey -> providerInstanceId }
    - rangeMinMs / rangeMaxMs

  freeBusyCache/{cacheKey}
    - payload
    - expiresAtMs
```

## Planned Additions (Phase 1)

### Per-Calendar Sync Settings

Stored in `users/{uid}/calendars/{calendarId}`:

```
syncEnabled: boolean
writebackEnabled: boolean
writebackVisibility: 'default' | 'private'
lifeosColor: string
```

- `syncEnabled`: whether the calendar is included in pull sync.
- `writebackEnabled`: only affects LifeOS-originated events; provider-origin
  events never write back.
- `writebackVisibility`: applied only when creating new events in the provider.
- `lifeosColor`: base color used in LifeOS UI (event shade derived by rules).

### Per-Calendar Sync State Key

Store sync state per account + calendar:

```
users/{uid}/calendarSyncState/{accountId}:{calendarId}
```

Fields (planned):
```
accountId: string
calendarId: string
syncToken?: string
lastSyncAt?: string
lastSuccessAt?: string
lastError?: string
updatedAt?: string
```

This allows incremental sync token storage and 15-minute freshness checks per
calendar, while still supporting account-level status if needed.
