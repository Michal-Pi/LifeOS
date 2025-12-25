# Todos Overview

This document describes the current Todos implementation in the Vite web client.

## Data Model

Types live in `apps/web-vite/src/types/todo.ts`.

- **Project** → top-level container (optional objective + key results)
- **Milestone** → optional grouping under a project
- **Task** → atomic work item (only tasks appear in priority views)

## Firestore Collections

```
users/{userId}/projects/{projectId}
users/{userId}/milestones/{milestoneId}
users/{userId}/tasks/{taskId}
```

## Behavior

- Tasks can exist without a project or milestone.
- Tasks inherit domain from project when linked.
- Urgency is manual only if no due date is set; otherwise it is inferred.
- Priority score = urgency score × importance score.
- Tasks can be scheduled into the calendar via `calendarEventIds`.
- Task forms use sliders for urgency/importance with live labels and auto-inference when due dates exist.
- Scheduling defaults the event duration to the task’s estimated time (or 60 minutes).
- Todos use Firestore offline persistence (IndexedDB). Cached writes sync when online.
- Task reloads merge by `updatedAt` (last-write-wins) and then normalize domain/urgency rules.
- Todo views load tasks by scope (all, project, milestone) and merge into the local cache.
- Priority scores are cached per task based on `updatedAt`, urgency, due date, and importance.

## Key Files

- UI: `apps/web-vite/src/pages/TodoPage.tsx`
- Forms: `apps/web-vite/src/components/TaskFormModal.tsx`, `ProjectFormModal.tsx`, `MilestoneFormModal.tsx`
- Repository: `apps/web-vite/src/adapters/firestoreTodoRepository.ts`
- Hook: `apps/web-vite/src/hooks/useTodoOperations.ts`
- Priority logic: `apps/web-vite/src/lib/priority.ts`
- Normalization + conflict merge: `apps/web-vite/src/lib/todoRules.ts`
- Project time insights: `apps/web-vite/src/pages/ProjectsPage.tsx`
