# @lifeos/habits

Habits domain package for LifeOS. Covers habit definitions, daily check-ins, and incantations.

## Features

- Habit models with schedules, anchors, and safety nets
- Daily check-ins with streak-friendly status tracking
- Incantations linked to habits and domains
- Sync state and versioning for conflict handling

## Data Models

- `CanonicalHabit` (habits, schedules, anchors, projections)
- `CanonicalHabitCheckin` (daily status + context)
- `CanonicalIncantation` (identity/values/self-compassion statements)

See `src/domain/models.ts` for full definitions.

## Repository Pattern

Ports live in `src/ports/` and are implemented in the web app:

- Firestore adapters: `apps/web-vite/src/adapters/habits/`

## Status

Late beta, close to GA. Docs and tests still in progress.

## Related Docs

- `docs/Habits and Mind Engine and Exercise Planner.md`
