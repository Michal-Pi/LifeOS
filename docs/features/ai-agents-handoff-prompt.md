# AI Agent Framework - Handoff Prompt for Fresh Chat

**Use this prompt to start a new chat session with full context.**

---

## Prompt

```
I'm working on the AI Agent Framework for LifeOS, a multi-AI provider collaboration system. Here's the current state:

PROJECT CONTEXT:
- Location: /Users/pilawski/Library/CloudStorage/Dropbox/Cursor_Projects/LifeOS_2
- Tech Stack: React + Vite + TypeScript, Firebase (Functions, Firestore, Auth)
- AI Providers: OpenAI, Anthropic, Google Gemini, xAI (Grok)

COMPLETED WORK (Phase 1-5D):
✅ Phase 1: Core domain models (packages/agents/src/)
✅ Phase 2: React integration (Firestore adapters, hooks, UI components)
✅ Phase 3: Workspace management UI
✅ Phase 4: Backend execution for all 4 providers + multi-agent workflows
✅ Phase 5A: Tool calling framework
✅ Phase 5B: Tool call persistence to Firestore
✅ Phase 5C: Tool call UI (timeline, status tracking)
✅ Phase 5D: Advanced built-in tools (calendar, notes, web search)

KEY FILES:
- Domain: packages/agents/src/domain/models.ts
- Backend: functions/src/agents/ (services, executors, tools)
- Frontend: apps/web-vite/src/components/agents/ and /hooks/
- Docs: docs/features/ai-agents-progress-summary.md (full details)

ARCHITECTURE:
- Firestore schema: users/{userId}/agents, workspaces/{workspaceId}/runs/{runId}/toolCalls
- Cloud Functions trigger on run creation
- Real-time UI updates via Firestore subscriptions
- Tool execution with full tracking (status, timing, cost)

CURRENT TOOLS (Phase 5D):
- Calendar: list_calendar_events, create_calendar_event
- Notes: list_notes, create_note, read_note
- Web: web_search (Google Custom Search API)
- Basic: get_current_time, calculate, query_firestore

REMAINING WORK:
✅ Phase 5E: Error handling & reliability (retry logic, timeouts, rate limiting)
⏸️ Phase 6A: Conversation memory (context injection + resume pending)
⏸️ Phase 6B: Streaming responses
⏸️ Phase 6C: Custom tool registration UI (no marketplace)
⏸️ Phase 6D: Agent templates
⏸️ Phase 6E: Advanced orchestration

DEVELOPMENT WORKFLOW:
1. Read docs/features/ai-agents-progress-summary.md for complete context
2. Check agents-roadmap.md for phase details
3. Use TodoWrite to track tasks
4. Always run typecheck and lint before committing
5. Run tests (`pnpm --filter web-vite test`, `pnpm --filter functions test`) before committing
6. Update phase completion docs after each phase

NEXT TASK:
[Specify what you want to work on - e.g., "Start Phase 5E: Implement retry logic" or "Add a new tool for X"]

Please review the summary doc first, then let me know you're ready to proceed with [NEXT TASK].
```

---

## Quick Reference

### Read First

1. [docs/features/ai-agents-progress-summary.md](./ai-agents-progress-summary.md) - Complete status
2. [docs/features/agents-roadmap.md](./agents-roadmap.md) - Phase breakdown
3. [docs/Agent Framework.md](../Agent%20Framework.md) - Original PRD

### File Locations

**Domain (Phase 1)**:

- `packages/agents/src/domain/models.ts` - Core types
- `packages/agents/src/ports/` - Repository interfaces
- `packages/agents/src/usecases/` - Business logic

**Backend (Phase 4-5)**:

- `functions/src/agents/openaiService.ts` - OpenAI integration
- `functions/src/agents/anthropicService.ts` - Anthropic integration
- `functions/src/agents/googleService.ts` - Google integration
- `functions/src/agents/grokService.ts` - xAI integration
- `functions/src/agents/workflowExecutor.ts` - Orchestration
- `functions/src/agents/runExecutor.ts` - Cloud Function trigger
- `functions/src/agents/toolExecutor.ts` - Tool framework
- `functions/src/agents/advancedTools.ts` - Phase 5D tools
- `functions/src/agents/retryHelper.ts` - Retry logic (Phase 5E)
- `functions/src/agents/errorHandler.ts` - Error handling and timeouts (Phase 5E)
- `functions/src/agents/rateLimiter.ts` - Rate limiting (Phase 5E)
- `functions/src/agents/quotaManager.ts` - Quota management (Phase 5E)
- `functions/src/agents/messageStore.ts` - Message persistence + pruning/compaction (Phase 6A)
- `users/{userId}/settings/aiProviderKeys` - Per-user API keys (openaiKey, anthropicKey, googleKey, xaiKey)

**Frontend (Phase 2-3, 5C)**:

- `apps/web-vite/src/adapters/agents/` - Firestore adapters
- `apps/web-vite/src/hooks/` - React hooks (useAgentOperations, useWorkspaceOperations, useToolCallOperations)
- `apps/web-vite/src/hooks/useRunMessages.ts` - Run message history (paged) (Phase 6A)
- `apps/web-vite/src/components/agents/` - UI components
- `apps/web-vite/src/pages/` - Pages (AgentsPage, WorkspacesPage, WorkspaceDetailPage)

### Commands

```bash
# Typecheck
pnpm --filter @lifeos/agents typecheck  # Domain package
pnpm --filter functions typecheck        # Backend
pnpm --filter web-vite typecheck         # Frontend

# Lint
pnpm --filter functions run lint
pnpm --filter web-vite run lint

# Build
pnpm --filter @lifeos/agents build
pnpm --filter functions build

# Deploy
firebase deploy --only functions         # Backend
firebase deploy --only hosting           # Frontend
```

### Workflow

1. **Start new phase**:
   - Use TodoWrite to create task list
   - Read relevant completion docs from previous phases
   - Check roadmap for deliverables

2. **Implementation**:
   - Follow existing patterns (check similar files)
   - Use TypeScript strictly
   - Handle errors gracefully
   - Add comments for complex logic

3. **Testing**:
   - Run typecheck (must pass)
   - Run lint (must pass)
   - Manual testing in UI
   - Document test results

4. **Completion**:
   - Create phase completion doc in docs/features/
   - Update progress summary
   - Commit with detailed message
   - Mark todos as completed

### Common Patterns

**Firestore Queries**:

```typescript
const db = getFirestore()
const ref = db.collection(`users/${userId}/collection`)
const snapshot = await ref.where('field', '==', value).get()
```

**React Hooks**:

```typescript
export function useXOperations() {
  const { user } = useAuth()
  const [state, setState] = useState({ ... })

  useEffect(() => {
    // Firestore subscription
  }, [user])

  return { ...state, operations }
}
```

**Tool Definition**:

```typescript
export const myTool: ToolDefinition = {
  name: 'tool_name',
  description: 'What the tool does',
  parameters: {
    type: 'object',
    properties: { ... },
    required: ['param1']
  },
  execute: async (params, context: ToolExecutionContext) => {
    // Implementation
    return result
  }
}
```

---

## Example Usage

### Starting Phase 5E

```
[Paste full prompt above]

NEXT TASK: Start Phase 5E - Implement retry logic for failed tool calls

Please review the summary doc first, then let me know you're ready to proceed.
```

### Adding a New Tool

```
[Paste full prompt above]

NEXT TASK: Add a new tool called "send_email" that allows agents to send emails using SendGrid API

Please review the summary doc first, then help me implement this tool following Phase 5D patterns.
```

### Fixing a Bug

```
[Paste full prompt above]

ISSUE: Tool calls are not showing up in the UI for runs that completed before Phase 5C

NEXT TASK: Debug why older runs don't display tool calls in WorkspaceDetailPage

Please review the code and help me fix this issue.
```

---

## Notes

- **Always read the summary doc first** - It contains critical context
- **Use existing patterns** - Don't reinvent wheels, follow Phase 1-5D patterns
- **Test thoroughly** - Typecheck + lint must pass before committing
- **Document everything** - Update completion docs after each phase
- **No marketplace** - Tool marketplace is removed from roadmap per user request
- **Focus on reliability** - Phase 5E is high priority (error handling)

---

**Last Updated**: December 29, 2025
**Created For**: Continuing AI Agent Framework development in new chat sessions
