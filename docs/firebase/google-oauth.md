# Google Calendar OAuth Flow

This document outlines how the Firebase Cloud Functions handle Google Calendar connections and where tokens live.

## Endpoints

- `googleAuthStart`: Called from the web client (`apps/web-vite`) with `uid` and optional `accountId`. Returns an authorization URL for redirect.
- `googleAuthCallback`: Google redirects to this endpoint with a `code` and the previously-generated `state`. The function exchanges the code for tokens and stores them in Firestore.
- `googleDisconnect`: Deletes the stored tokens and marks the calendar account as disconnected.

> All endpoints are implemented in `functions/src/index.ts` and use Firebase Functions v2 via `onRequest`.

## Firestore storage

Tokens are stored in `users/{uid}/privateIntegrations/googleAccounts/{accountId}`:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiryDate": "2024-12-01T12:00:00.000Z",
  "scope": "...",
  "updatedAt": "2024-12-01T12:00:00.000Z",
  "status": "connected",
  "tokenType": "Bearer"
}
```

Calendar account metadata is kept under `users/{uid}/calendarAccounts/{accountId}` with fields like `status`, `updatedAt`, and `lastSuccessAt`.

## Security & rules

- Clients are prohibited from reading `/users/{uid}/privateIntegrations/**` — only Admin-level operations (Cloud Functions) can touch those documents.
- Temporary OAuth state (`nonces`) lives in the top-level `tempOAuthStates` collection.

## Sync helpers

- `syncNow` (HTTP): triggers `syncGoogleAccount` for manual testing.
- `scheduleSync` (Cloud Scheduler): reuses the same helper to write canonical events and update account status.

## Local development

When running the emulator suite:

1. Start the emulator: `pnpm firebase:emulators`.
2. Visit `http://localhost:5001/` for the Functions emulator.
3. Trigger `googleAuthStart` manually or via the UI to obtain the emulator auth URL. The callback also runs on the emulator port (e.g., `http://localhost:5001/<project-id>/us-central1/googleAuthCallback`), so `GOOGLE_OAUTH_REDIRECT_URI` for local testing should point there.

