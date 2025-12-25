# Firebase Overview

- **Remote project**: we currently target a single Firebase project (alias `default`) for Auth, Firestore, Functions v2, and Hosting.
- **Local development**: the Firebase Emulator Suite runs Auth, Firestore, Functions, Hosting, and the Emulator UI.
- **Future staging**: add another alias entry in `.firebaserc` when we introduce a staging project; the emulator setup remains the same.

## Google OAuth and Functions

The Cloud Functions expose `googleAuthStart`, `googleAuthCallback`, and `googleDisconnect` endpoints for OAuth, storing tokens under `/users/{uid}/privateIntegrations/googleAccounts/{accountId}` and keeping calendar metadata under `/users/{uid}/calendarAccounts/{accountId}`. See `docs/firebase/google-oauth.md` for the flow diagram, Firestore layout, and how to run the flow in the emulator.
