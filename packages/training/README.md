# @lifeos/training

Training domain package for LifeOS. Covers exercise library, templates, plans, and workout sessions.

## Features

- Exercise library with default metrics
- Workout templates with per-exercise targets
- Weekly workout plans with contexts
- Workout sessions with performance logs
- Sync state and versioning for conflict handling

## Data Models

- `ExerciseLibraryItem`
- `WorkoutTemplate`
- `WorkoutPlan`
- `WorkoutSession`

See `src/domain/models.ts` for full definitions.

## Repository Pattern

Ports live in `src/ports/` and are implemented in the web app:

- Firestore adapters: `apps/web-vite/src/adapters/training/`

## Status

Late beta, close to GA. Docs and tests still in progress.

## Related Docs

- `docs/Habits and Mind Engine and Exercise Planner.md`
