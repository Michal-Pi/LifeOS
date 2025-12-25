# Firebase Hosting

Hosting serves the Vite build output from `apps/web-vite/dist`.

- Build: `pnpm -C apps/web-vite build`
- Deploy: `firebase deploy --only hosting`

The full deploy script `pnpm firebase:deploy` runs the build for you.
