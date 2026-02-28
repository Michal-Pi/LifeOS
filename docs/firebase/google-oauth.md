# Google Calendar OAuth Flow

This document outlines how the Firebase Cloud Functions handle Google Calendar connections and where tokens live.

## OAuth Scopes

The application requests the following Google OAuth scopes (defined in `functions/src/index.ts`):

| Scope              | Access     | Purpose                                |
| ------------------ | ---------- | -------------------------------------- |
| `calendar`         | Read/write | Full calendar management               |
| `calendar.events`  | Read/write | Event CRUD and sync                    |
| `contacts`         | Read/write | Google Contacts import and CRM sync    |
| `drive`            | Read/write | Drive file access for agent tools      |
| `gmail.modify`     | Read/write | Email read, send, and label management |
| `userinfo.email`   | Read       | User email for authentication          |
| `userinfo.profile` | Read       | User profile for display               |
| `openid`           | Read       | OpenID Connect identity                |

### GCP Prerequisites

Before OAuth will work for all features, ensure the following are enabled in the [Google Cloud Console](https://console.cloud.google.com):

1. **APIs & Services > Library** — Enable:
   - Google Calendar API
   - People API
   - Google Contacts API
   - Google Drive API
   - Gmail API
2. **APIs & Services > OAuth consent screen** — Ensure all scopes above are listed under approved scopes. If the app is in "Testing" mode, test users must be added explicitly.

### Re-authorization

When scopes are added or upgraded (e.g., `drive.readonly` → `drive`), existing users must re-authorize. The OAuth flow uses `include_granted_scopes: true` for incremental consent, but the new scopes must still be presented to the user. To force re-auth: disconnect the Google account in Settings, then reconnect.

## Endpoints

- `googleAuthStart`: Called from the web client (`apps/web-vite`) with `uid` and optional `accountId`. Returns an authorization URL for redirect.
- `googleAuthCallback`: Google redirects to this endpoint with a `code` and the previously-generated `state`. The function exchanges the code for tokens and stores them in Firestore.
- `googleDisconnect`: Deletes the stored tokens and marks the calendar account as disconnected.
- `syncContactsNow`: On-demand Google Contacts sync. Called with `uid` and `accountId`. Fetches contacts via the People API and merges them into the CRM.
- `scheduleContactsSync`: Scheduled function that runs every 24 hours to sync contacts for all connected accounts.

> All endpoints are implemented in `functions/src/index.ts` and use Firebase Functions v2 via `onRequest` / `onSchedule`.

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

## Redirect URI

Production redirect URI is handled by Firebase Hosting and rewrites to the Cloud Function:

- `https://<project>.web.app/oauth/google/callback` → `googleAuthCallback`

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
