# Shared Package Boundaries

## Core rules (Phase 1.2)

- Shared `@lifeos/*` packages must stay platform-agnostic. They **must not** import `react`, `react-dom`, `next`, `next/*`, or any browser-only globals like `window`, `document`, `navigator`, `location`, etc.
- Shared packages must only see each other through public entry points (e.g. `@lifeos/calendar`, not `@lifeos/calendar/src/usecases/...`).
- Platform-specific behavior (storage, notifications, clipboard, etc.) lives behind **ports** and is implemented by adapters in `packages/platform-web`, `apps/web-vite`, or future platform packages.
- Each package exposes its API via `src/index.ts` and the package root `exports` map; consumers never import internal files.

## Standard module layout

```
src/
  domain/      ← pure domain models & types (no external dependencies)
  usecases/    ← business logic that depends on domain + ports
  ports/       ← interfaces that adapters must implement
  adapters/    ← optional helpers / adapters that satisfy ports
  index.ts     ← re-export the package’s public API
```

### Dependency graph

Allowed:

```
domain → (nothing)
ports  → domain
usecases → domain, ports
adapters → usecases, ports, platform libs (Firebase, storage, etc.)
apps/web-vite → shared package APIs + platform adapters
```

Disallowed:

- Shared packages importing browser APIs or React/Next packages.
- Shared packages importing another package’s internals (`@lifeos/calendar/src/...`).
- Shared packages importing `apps/web-vite` or other application code.

### Naming & exports

- Package name format: `@lifeos/<name>`. Every package is listed in pnpm workspace + tsconfig references.
- All exports must be rooted in `src/index.ts`; external callers import only the root entrypoint.

The ESLint boundaries in `eslint.config.js` enforce these rules automatically for RN readiness.
