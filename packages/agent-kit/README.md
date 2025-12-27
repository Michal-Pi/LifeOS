# @lifeos/agent-kit

`@lifeos/agent-kit` holds shared agent abstractions used to coordinate background workers. It keeps agent models, ports, and use cases free of platform assumptions.

## Responsibilities

- Define agent concepts (commands, statuses) in `domain`.
- Provide ports that adapters implement for executing agent actions.
- Offer minimal use cases for scheduling or canceling agent tasks.

## Non-responsibilities

- No React/Next/browser API imports.
- No platform implementations; adapters live in higher-level packages.

## Public API

- `src/index.ts` exports the agent models, ports, and use cases.
- `src/domain`, `src/usecases`, `src/ports`, `src/adapters` follow the standard layout.
