# @lifeos/mind

Mind Engine domain package for LifeOS. Defines intervention presets and session logs.

## Features

- Intervention presets with structured steps
- Session logs with before/after state tracking
- Sync state and versioning for conflict handling

## Data Models

- `CanonicalInterventionPreset` (step-based interventions)
- `CanonicalInterventionSession` (runs of interventions)

See `src/domain/models.ts` for full definitions.

## Repository Pattern

Ports live in `src/ports/` and are implemented in the web app:

- Firestore adapters: `apps/web-vite/src/adapters/mind/`

## Status

Late beta, close to GA. Docs and tests still in progress.

## Related Docs

- `docs/Habits and Mind Engine and Exercise Planner.md`
