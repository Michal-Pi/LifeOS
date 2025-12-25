# pnpm in LifeOS

LifeOS is a pnpm workspace. Use `pnpm` (not npm/yarn) so workspace linking stays consistent.

## Common Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
```

## Targeting a Package

```bash
pnpm --filter web-vite dev
pnpm --filter functions build
pnpm -C apps/web-vite build
```

## One-off Binaries

```bash
pnpm exec tsc -b
pnpm dlx firebase-tools deploy
```
