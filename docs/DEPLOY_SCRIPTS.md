# Deployment Scripts

Use these scripts to ensure builds happen before deployment.

## Full Deploy

```bash
pnpm firebase:deploy
```

Runs `turbo run build` then `firebase deploy`.

## Functions Only

```bash
pnpm firebase:deploy:functions
```

Builds functions (with deps) and deploys only functions.

## Hosting Only (Manual)

If you only changed the web app:

```bash
pnpm -C apps/web-vite build
firebase deploy --only hosting
```

## Common Issues

- **Functions not updating**: always build before deploy; use the scripts above.
- **Missing web config**: ensure `VITE_*` variables exist at build time.
