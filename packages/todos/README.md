# @lifeos/todos

`@lifeos/todos` defines the task domain plus the ports/use cases that manage them.

## Responsibilities

- Declare todo entities, status enums, and business rule helpers.
- Expose ports (repositories, schedulers, reminders) for platform adapters.
- Offer pure use cases (create, list, complete) that depend only on ports/domain.

## Non-responsibilities

- No React/Next or browser API dependencies.
- No direct storage or UI implementations.

## Public API

- `src/domain/*.ts` for models.
- `src/ports` for interface definitions.
- `src/usecases` for the business logic.
- `src/index.ts` exports the package’s public symbols.

## Ports

- Keep ports lean (e.g., `TodoRepository`) so adapters can implement storage later.
