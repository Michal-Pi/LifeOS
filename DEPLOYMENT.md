# Deployment Guide (Firebase Hosting + Functions)

LifeOS ships as a Vite SPA + Firebase Cloud Functions.

## Build + Deploy

```bash
pnpm firebase:deploy
```

This runs `turbo run build` and then `firebase deploy`.

### Functions Only

```bash
pnpm firebase:deploy:functions
```

## Environment Variables (Web)

Vite embeds `VITE_*` variables at build time. Create one of:

- `apps/web-vite/.env.local` (local dev)
- `apps/web-vite/.env.production` (manual prod build)

Example:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Firebase Hosting

`firebase.json` points hosting to `apps/web-vite/dist`.

## Cloud Functions

Functions live in `functions/src` and are built by `pnpm --filter functions build` (invoked via Turbo during deploy).

Secrets are managed via `firebase functions:secrets:*`.

## CI/CD Notes

If you run deployment in CI:

1. Provide the `VITE_*` variables at build time.
2. Use a Firebase CI token (`firebase login:ci`).
3. Run `pnpm firebase:deploy`.

## Troubleshooting

- **Missing config in production**: ensure `VITE_*` variables exist at build time.
- **Functions not updated**: verify build ran (`pnpm firebase:deploy` handles this).
