# Platform Web

Browser-only adapters that consume web APIs and feed data to the modules. This package keeps DOM-specific dependencies out of pure TypeScript packages so the core domain stays portable.

## Contents

- `storage.ts` wraps browser storage access points.
- Additional adapters (notifications, fetch helpers) will live here later when needed.
