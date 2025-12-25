# Firebase Secrets and Templates

- Commit only templates (e.g., `apps/web-vite/.env.local.example`). Never commit real keys.
- Use CI secrets (e.g., `FIREBASE_TOKEN`, `VITE_FIREBASE_API_KEY`).
- Local dev: copy `.env.local.example` into `apps/web-vite/.env.local` and fill in your Firebase Web config. Set `VITE_USE_EMULATORS=true` to target local emulators.
- Keep sensitive tokens (service accounts, OAuth secrets) out of the repo.

## Google OAuth Secrets

Cloud Functions use three secrets:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

Set them via Firebase CLI:

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID="your_google_client_id"
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET="your_google_client_secret"
firebase functions:secrets:set GOOGLE_OAUTH_REDIRECT_URI="https://us-central1-<project>.cloudfunctions.net/googleAuthCallback"
```

## Client Function Base URL

Use `VITE_FIREBASE_FUNCTIONS_URL` to override the functions base URL for the SPA.
