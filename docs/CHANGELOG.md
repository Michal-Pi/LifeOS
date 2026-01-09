# Changelog

This document summarizes all changes since the previous commit.

## Design System & Theme

- Reworked core tokens, luminance layers, text tiers, and panel effects in `apps/web-vite/src/tokens.css`.
- Updated global styling for contrast, muted text usage, and background textures in `apps/web-vite/src/globals.css`.
- Refined typography and component styling across pages and shared UI (cards, inputs, alerts, tables, charts).
- Extended theme controls and behavior in `apps/web-vite/src/contexts/ThemeContext.tsx` and related UI.
- Updated documentation in `README_DESIGN_SYSTEM.md`, `docs/DESIGN_SYSTEM.md`, and `docs/IMPLEMENTATION_GUIDE.md`.

## Notes Experience

- Reworked Notes layout, header actions, and editor sizing in `apps/web-vite/src/pages/NotesPage.tsx`.
- Moved tags to the header and simplified inline sections by replacing linkers with header panels.
- Aligned sidebar layout and button sizing in `apps/web-vite/src/components/notes/ProjectSidebar.tsx`.
- Added note content sanitation and empty draft suppression in:
  - `apps/web-vite/src/notes/noteContent.ts`
  - `apps/web-vite/src/hooks/useNoteEditor.ts`
  - `apps/web-vite/src/hooks/useNoteOperations.ts`
  - `apps/web-vite/src/notes/syncWorker.ts`
- Improved outbox handling and sync resilience for notes and sections in `apps/web-vite/src/notes/noteOutbox.ts`.
- Enhanced conflict resolution UI and styling in `apps/web-vite/src/components/notes/ConflictResolutionModal.tsx` and `apps/web-vite/src/components/notes/ConflictResolutionModal.css`.
- Updated export UI in `apps/web-vite/src/components/notes/ExportMenu.tsx` and styles in `apps/web-vite/src/globals.css`.
- Added tag editor UI in `apps/web-vite/src/components/notes/TagEditor.tsx`.

## Editor & Command UX

- Reordered and refined the editor toolbar in `apps/web-vite/src/components/editor/TipTapMenuBar.tsx`.
- Added text color support via `apps/web-vite/src/components/editor/extensions/TextColor.ts`.
- Updated menu styling, color swatches, and custom color inputs in `apps/web-vite/src/components/editor/TipTapMenuBar.css`.
- Added matrix builder and improved math panel UI in:
  - `apps/web-vite/src/components/editor/ux/MathInlinePanel.tsx`
  - `apps/web-vite/src/components/editor/ux/MathInlinePanel.css`
- Improved block hover and block menu experience in:
  - `apps/web-vite/src/components/editor/ux/NodeDivider.tsx`
  - `apps/web-vite/src/components/editor/ux/NodeDivider.css`
  - `apps/web-vite/src/components/editor/ux/NodeDividerContainer.tsx`
  - `apps/web-vite/src/components/editor/ux/BlockMenu.tsx`
  - `apps/web-vite/src/components/editor/ux/BlockMenu.css`
- Refined command menu UX in `apps/web-vite/src/components/editor/ux/CommandMenu.tsx` and `apps/web-vite/src/components/editor/ux/CommandMenu.css`.
- Adjusted editor layout and spacing in `apps/web-vite/src/components/editor/TipTapEditor.tsx` and `apps/web-vite/src/components/editor/TipTapEditor.css`.

## Notifications & Dialogs

- Added dialog context and provider wiring:
  - `apps/web-vite/src/contexts/DialogContext.tsx`
  - `apps/web-vite/src/contexts/DialogContextDefinition.ts`
  - `apps/web-vite/src/contexts/useDialog.ts`
  - `apps/web-vite/src/components/Providers.tsx`
- Added notification hooks and cleanup utilities:
  - `apps/web-vite/src/hooks/useNotifications.ts`
  - `apps/web-vite/src/utils/notificationCleanup.ts`
  - `apps/web-vite/src/hooks/useFirestoreListener.ts`
  - `apps/web-vite/src/utils/errorMessages.ts`

## Calendar & Scheduling

- Added daily view implementation in `apps/web-vite/src/components/DailyView.tsx`.
- Added calendar color helpers in `apps/web-vite/src/components/calendar/calendarColors.ts`.
- Updated calendar view containers and settings UI across:
  - `apps/web-vite/src/components/calendar/CalendarViewsContainer.tsx`
  - `apps/web-vite/src/components/CalendarSettingsPanel.tsx`
  - `apps/web-vite/src/components/DeleteAllCalendarDataSection.tsx`
  - `apps/web-vite/src/components/CleanupOrphanedDataSection.tsx`
- Updated event operations and alert flows:
  - `apps/web-vite/src/hooks/useEventOperations.ts`
  - `apps/web-vite/src/hooks/useEventService.ts`
  - `apps/web-vite/src/hooks/useEventAlerts.ts`
  - `apps/web-vite/src/utils/calendarHelpers.ts`

## App Shell & Pages

- Updated app shell layout and routing in `apps/web-vite/src/App.tsx` and `apps/web-vite/src/components/AppShell.tsx`.
- Refined layouts/styles across core pages:
  - `apps/web-vite/src/pages/AgentsPage.tsx`
  - `apps/web-vite/src/pages/ExerciseLibraryPage.tsx`
  - `apps/web-vite/src/pages/HabitsPage.tsx`
  - `apps/web-vite/src/pages/PlannerPage.tsx`
  - `apps/web-vite/src/pages/SettingsPage.tsx`
  - `apps/web-vite/src/pages/WeeklyReviewPage.tsx`
  - `apps/web-vite/src/pages/WorkoutTemplatePage.tsx`
  - `apps/web-vite/src/pages/WorkspaceDetailPage.tsx`
  - `apps/web-vite/src/pages/WorkspacesPage.tsx`
- Updated charts and UI components in:
  - `apps/web-vite/src/components/DomainBarChart.tsx`
  - `apps/web-vite/src/components/MonthView.tsx`
  - `apps/web-vite/src/components/TaskFormModal.tsx`
  - `apps/web-vite/src/components/TaskList.tsx`
  - `apps/web-vite/src/components/ThemeToggle.tsx`
  - `apps/web-vite/src/components/ConfirmDialog.tsx`
  - `apps/web-vite/src/components/ErrorBoundary.tsx`

## Agents & Tooling

- Updated agent UI styles and workflow views:
  - `apps/web-vite/src/components/agents/ToolCallTimeline.tsx`
  - `apps/web-vite/src/components/agents/ToolCallTimeline.css`
  - `apps/web-vite/src/components/agents/WorkflowGraphView.tsx`
- Updated server agent executor in `functions/src/agents/runExecutor.ts`.

## Backend & Firebase

- Updated functions behavior in `functions/src/index.ts`.
- Updated Firestore rules and indexes in `firestore.rules` and `firestore.indexes.json`.
- Updated notes package documentation and model definitions:
  - `packages/notes/README.md`
  - `packages/notes/src/domain/models.ts`

## Miscellaneous

- Added planning and review docs: `CODE_REVIEW.md`, `IMPLEMENTATION_PLAN.md`, `TODOS_AND_PLACEHOLDERS.md`.
- Added reference screenshot `layout.png`.
