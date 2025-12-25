# Emulator Smoke Tests

1. Start the suite: `pnpm firebase:emulators`.
2. In another terminal, run `curl http://localhost:5001/lifeos-phase-1/us-central1/helloWorld` (name from functions). It should return `{"ok":true,...}`.
3. Use `gcloud`/`curl` to create a Firestore document: `curl -X POST http://localhost:8080/v1/projects/lifeos-phase-1/databases/(default)/documents/users/testuser/profile?documentId=test -H "Content-Type: application/json" -d '{"fields": {"name": {"stringValue": "Test"}}}' --header "Authorization: bearer owner"`.
4. Access limited path to prove rules: try reading `/users/otheruser/profile/test` and ensure the emulator returns PERMISSION_DENIED.
