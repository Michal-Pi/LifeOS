# LifeOS Roadmap

This plan reflects the current codebase and near-term work.

## Now

- Maintain calendar + sync stability
- Harden todos (projects/milestones/tasks) UX
- Fill in Notes module (data model + editor)

## Next

### Notes
- Define domain model in `packages/notes-learning`
- Add Firestore adapter in `apps/web-vite/src/adapters`
- Build UI for editor, list, search

### People / Projects Modules
- Define domain models and adapters
- Replace placeholders with functional views

### Performance + UX
- Improve list virtualization + chunking
- Reduce bundle size (manual chunks in Vite)
- Expand tests in web-vite

## Future

- Multi-provider calendar sync
- AI/agent features (deferred)
