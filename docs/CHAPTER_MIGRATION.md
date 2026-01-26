# Chapter Migration (Milestones → Chapters)

This project renamed Todo milestones to chapters. Existing data must be migrated once.

## What changes

- Collection path: `users/{userId}/milestones` → `users/{userId}/chapters`
- Task field: `milestoneId` → `chapterId`

## Script

Run the migration script in `functions/src/scripts/migrateChapters.ts` after building functions:

```bash
cd functions
pnpm run build
USER_ID="your-user-id" node lib/scripts/migrateChapters.js
```

The script:

- Copies milestone documents into the new `chapters` collection.
- Updates tasks with `chapterId` and removes `milestoneId`.

## Clean-up (optional)

After verifying data, you may delete the old `milestones` collection for the user.
