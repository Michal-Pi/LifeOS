# AI Agent Framework - Phase 6D: Agent Templates & Presets

## Overview

**Status**: ✅ Complete (v1)  
**Date**: December 30, 2025  
**Objective**: Provide reusable agent/workspace templates, presets, and import/export tooling.

Phase 6D delivers first-class templates for agents and workspaces, plus presets and JSON import/export
to reuse configurations across runs or accounts.

---

## What Was Implemented

### 1. Templates for Agents & Workspaces

- Save templates from existing agents/workspaces.
- Use templates to prefill creation modals.
- Firestore-backed storage per user.

**Key files**:
- `apps/web-vite/src/pages/AgentsPage.tsx`
- `apps/web-vite/src/pages/WorkspacesPage.tsx`
- `apps/web-vite/src/components/agents/TemplateSaveModal.tsx`
- `apps/web-vite/src/hooks/useAgentTemplateOperations.ts`
- `apps/web-vite/src/hooks/useWorkspaceTemplateOperations.ts`
- `apps/web-vite/src/adapters/agents/firestoreAgentTemplateRepository.ts`
- `apps/web-vite/src/adapters/agents/firestoreWorkspaceTemplateRepository.ts`

---

### 2. Preset Templates

- Presets for common agent roles and workspace workflows.
- One-click add to template library.

**Key file**:
- `apps/web-vite/src/agents/templatePresets.ts`

---

### 3. Import / Export

- Export templates to JSON.
- Import JSON files to restore/share templates.

---

## Data Model

Templates are stored per user:

```
users/{userId}/agentTemplates/{templateId}
users/{userId}/workspaceTemplates/{templateId}
```

---

## Notes

- Workspace presets start with empty `agentIds`; users must select agents before saving.
- Import skips invalid or duplicate names to avoid collisions.

---

## Verification

- Manual: create template → use template → verify prefilled modal.
- Manual: export JSON → re-import → verify new template appears.
