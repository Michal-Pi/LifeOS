# LifeOS Roadmap

This plan reflects the current codebase and near-term work.

## Completed (2025-12)

### Habits & Mind Engine (Phases 1-5)

- ✅ Domain packages (`@lifeos/habits`, `@lifeos/mind`) with full type safety
- ✅ Habit tracking with schedules, check-ins, mood tracking
- ✅ Mind interventions with step-by-step guidance (text, timer, choice, input steps)
- ✅ Analytics dashboard with habit trends, streaks, and mood correlation
- ✅ Weekly review integration with visual charts

### Notes Module (Phases 1-7)

- ✅ Domain model with sections, topics, attachments
- ✅ Offline-first with conflict resolution
- ✅ Template system with OKR integration
- ✅ Firestore adapters with full CRUD operations

### Clean Architecture Refactoring

- ✅ **Usecases Layer**: Extracted business logic from React hooks into pure domain functions
- ✅ **Testability**: 46/46 tests passing with unit tests for business rules
- ✅ **Separation of Concerns**: Clear boundaries between UI, business logic, and data access
- ✅ **Type Safety**: Full TypeScript strict mode with no implicit any types

## Now

- Maintain calendar + sync stability
- Harden todos (projects/chapters/tasks) UX
- Continue Training module (workout planning)

## Next

### Training Module (Phase 6+)

- Exercise library with movement patterns
- Workout planning with periodization
- Progress tracking with volume/intensity metrics
- Integration with calendar for scheduling

### People / Projects Modules

- Define domain models and adapters
- Replace placeholders with functional views

### Performance + UX

- Improve list virtualization + chunking
- Reduce bundle size (manual chunks in Vite)
- Expand tests in web-vite
- Offline store integration for all modules

## Future

- Multi-provider calendar sync
- AI/agent features (deferred)
- Cross-module analytics and insights
