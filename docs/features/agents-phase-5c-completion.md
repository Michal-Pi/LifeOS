# AI Agent Framework - Phase 5C: Tool UI Updates

## Overview

**Status**: ✅ Complete
**Date**: December 29, 2025
**Objective**: Display tool call execution in the UI to make tool calling visible and understandable for users

Phase 5C implements comprehensive UI components for displaying tool call history in the WorkspaceDetailPage. Users can now see exactly what tools agents called, the parameters used, results returned, and execution timing - all in a clean, collapsible timeline format.

---

## What Was Implemented

### 1. Tool Call Hook (`apps/web-vite/src/hooks/useToolCallOperations.ts`)

**New Hook**: `useToolCallOperations`

```typescript
export function useToolCallOperations(runId: RunId | null): UseToolCallOperationsReturn {
  // Real-time Firestore subscription to tool calls
  // Automatically updates when tool calls are created/updated
  // Returns: { toolCalls, isLoading, error }
}
```

**Features**:

- Real-time subscriptions via Firebase `onSnapshot`
- Automatic updates as tool calls execute
- Error handling with graceful degradation
- Sorted by `startedAtMs` (chronological order)
- Returns empty array when no runId provided

**Firestore Query**:

```typescript
const toolCallsRef = collection(db, `users/${userId}/runs/${runId}/toolCalls`)
const q = query(toolCallsRef, orderBy('startedAtMs', 'asc'))
```

**ESLint Compliance**:

- Avoids synchronous setState in effects (strict rule compliance)
- Uses subscription pattern (onSnapshot) for external system sync
- Clean-up via unsubscribe on unmount

### 2. Tool Call Timeline Component (`apps/web-vite/src/components/agents/ToolCallTimeline.tsx`)

**Purpose**: Display collapsible timeline of tool call executions

**Features**:

#### Collapsible Cards

- Click to expand/collapse individual tool calls
- Shows summary in collapsed state:
  - Tool name (monospace font)
  - Status badge (color-coded)
  - Duration
  - Iteration number
- Shows full details when expanded

#### Status Badges

Color-coded based on execution status:

| Status      | Color  | Class           |
| ----------- | ------ | --------------- |
| `completed` | Green  | `bg-green-100`  |
| `failed`    | Red    | `bg-red-100`    |
| `running`   | Blue   | `bg-blue-100`   |
| `pending`   | Yellow | `bg-yellow-100` |

#### Detailed Information (When Expanded)

1. **Timing Metrics**:
   - Started timestamp (formatted)
   - Completed timestamp (formatted)
   - Duration (formatted: ms, s, or both)

2. **Provider Context**:
   - Provider name (OpenAI, Anthropic, Google, xAI)
   - Model name

3. **Parameters**:
   - JSON formatted with syntax highlighting
   - Scrollable code block
   - 2-space indentation

4. **Results** (if successful):
   - JSON formatted result
   - Scrollable/collapsible
   - Max height 256px with overflow scroll

5. **Errors** (if failed):
   - Red-highlighted error message
   - Monospace font for stack traces

**Visual Design**:

- White cards with gray borders
- Hover effect on header
- Smooth expand/collapse animation (CSS transform)
- Responsive layout
- Clean, readable typography

### 3. Run Card Component (`apps/web-vite/src/components/agents/RunCard.tsx`)

**Purpose**: Unified component for displaying run details including tool calls

**Responsibilities**:

- Fetch tool calls via `useToolCallOperations` hook
- Display all run metadata (goal, status, progress, output, error, context)
- Embed `ToolCallTimeline` when tool calls exist
- Handle run deletion

**Integration**:

- Moved all run display logic from WorkspaceDetailPage
- Encapsulates tool call fetching per-run
- Clean separation of concerns

**Benefits**:

- Reusable across multiple pages
- Self-contained state management
- Easier to test and maintain

### 4. Updated WorkspaceDetailPage (`apps/web-vite/src/pages/WorkspaceDetailPage.tsx`)

**Changes**:

- Replaced inline run cards with `<RunCard>` component
- Removed redundant helper functions (moved to RunCard)
- Cleaner, more maintainable code
- Simplified rendering logic

**Before**:

```tsx
{
  filteredRuns.map((run) => (
    <div key={run.runId} className="run-card">
      {/* 60+ lines of inline JSX */}
    </div>
  ))
}
```

**After**:

```typescript
{
  filteredRuns.map((run) => (
    <RunCard key={run.runId} run={run} currentTime={currentTime} onDelete={handleDeleteRun} />
  ))
}
```

---

## User Experience

### What Users See

1. **Run History Page**:
   - Each run card now includes a "Tool Calls (N)" section
   - Real-time updates as tools execute
   - Collapsed by default for clean UI

2. **Tool Call Cards**:
   - Click any tool call to expand details
   - See exactly what parameters were sent
   - View the full result or error
   - Track execution timing

3. **Status Tracking**:
   - Green badge = completed successfully
   - Red badge = failed with error
   - Blue badge = currently running
   - Yellow badge = pending execution

4. **Debugging Workflow**:
   - Identify which tool calls failed
   - See exact error messages
   - Inspect parameters to understand why
   - Check execution order (iteration numbers)

---

## Technical Implementation

### Real-Time Updates

Tool calls update in real-time via Firestore `onSnapshot`:

```typescript
const unsubscribe = onSnapshot(
  q,
  (snapshot) => {
    const calls = snapshot.docs.map((doc) => doc.data() as ToolCallRecord)
    setState({ toolCalls: calls, isLoading: false, error: null })
  },
  (err) => {
    setState({ toolCalls: [], isLoading: false, error: err as Error })
  }
)
```

**Timeline**:

1. Run starts (status: pending)
2. Tool call created (status: pending) → UI updates immediately
3. Tool starts executing (status: running) → Badge turns blue
4. Tool completes (status: completed, result added) → Badge turns green, result appears
5. User expands card → Full details visible

### Formatting Helpers

**Duration Formatting**:

```typescript
const formatDuration = (durationMs?: number) => {
  if (!durationMs) return 'N/A'
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(2)}s`
}
```

Examples:

- `45ms`
- `1.23s`
- `N/A` (still running)

**Timestamp Formatting**:

```typescript
const formatTimestamp = (timestampMs: number) => {
  return new Date(timestampMs).toLocaleTimeString()
}
```

Examples:

- `2:45:30 PM`
- `14:45:30` (24-hour format)

**JSON Formatting**:

```tsx
<pre className="bg-white border rounded p-2 text-xs overflow-x-auto">
  {JSON.stringify(toolCall.parameters, null, 2)}
</pre>
```

Features:

- 2-space indentation
- Scrollable horizontal overflow
- Monospace font
- Syntax-highlighted (via CSS classes)

---

## File Structure

```
apps/web-vite/src/
├── hooks/
│   └── useToolCallOperations.ts (NEW)
├── components/agents/
│   ├── ToolCallTimeline.tsx (NEW)
│   └── RunCard.tsx (NEW)
└── pages/
    └── WorkspaceDetailPage.tsx (UPDATED)
```

---

## Testing

### TypeScript Compilation

```bash
pnpm --filter web-vite typecheck  # ✅ Passed
```

### ESLint

```bash
pnpm --filter web-vite run lint   # ✅ Passed
```

**Note**: Had to refactor hook to avoid synchronous setState in effect (strict ESLint rule `react-hooks/set-state-in-effect`).

---

## Use Cases Enabled

### 1. Debugging Failed Runs

**Scenario**: Agent run fails with error

**Workflow**:

1. Open WorkspaceDetailPage
2. Find the failed run (red badge)
3. Scroll to "Tool Calls" section
4. Expand failed tool call (red badge)
5. Read error message
6. Inspect parameters to understand issue

**Example**:

```
Tool Call: query_firestore
Status: failed (red)
Error: "Collection 'invalid_collection' not found"
Parameters: { "collection": "invalid_collection", "limit": 10 }
```

### 2. Understanding Agent Behavior

**Scenario**: Want to see what the agent did

**Workflow**:

1. Open completed run
2. View "Tool Calls" timeline
3. See sequence of tool executions
4. Expand each to see parameters and results

**Example Timeline**:

```
1. get_current_time (iteration 1) - completed - 45ms
2. query_firestore (iteration 2) - completed - 123ms
3. calculate (iteration 2) - completed - 12ms
```

### 3. Performance Analysis

**Scenario**: Identify slow tools

**Workflow**:

1. Review tool call durations
2. Identify outliers
3. Optimize slow tools

**Example**:

```
query_firestore: 2.34s (slow!)
get_current_time: 45ms (fast)
calculate: 12ms (fast)
```

### 4. Verifying Tool Parameters

**Scenario**: Ensure agent is calling tools correctly

**Workflow**:

1. Expand tool call
2. Inspect parameters section
3. Verify values are correct

**Example**:

```json
{
  "collection": "todos",
  "limit": 10
}
```

### 5. Tracking Multi-Iteration Execution

**Scenario**: Agent uses multiple tool calls in sequence

**Workflow**:

1. View all tool calls
2. Note iteration numbers
3. Understand execution flow

**Example**:

```
Tool Call 1 (iteration 1): get_current_time
Tool Call 2 (iteration 2): query_firestore
Tool Call 3 (iteration 2): calculate (parallel with #2)
Tool Call 4 (iteration 3): query_firestore (retry after error)
```

---

## Architecture Patterns

### 1. Hook-Based State Management

- Custom hook (`useToolCallOperations`) encapsulates Firestore logic
- Component stays clean, focused on rendering
- Easy to test independently

### 2. Component Composition

- `ToolCallTimeline` → presentational, receives data as props
- `RunCard` → container, fetches data via hook
- `WorkspaceDetailPage` → orchestrates, delegates to RunCard

### 3. Real-Time Subscriptions

- Uses Firestore `onSnapshot` for live updates
- Automatically re-renders when data changes
- Clean-up on unmount prevents memory leaks

### 4. Collapsible UI Pattern

- Summary view (collapsed) shows key info
- Detail view (expanded) shows full data
- User controls visibility (progressive disclosure)

---

## Styling

Uses existing LifeOS design system:

- **Badges**: `.badge-success`, `.badge-error`, `.badge-info`, `.badge-warning`
- **Cards**: `.run-card` with consistent padding/spacing
- **Typography**: Monospace for code, sans-serif for text
- **Colors**: Tailwind CSS classes for consistency
  - Green: `bg-green-100 text-green-800`
  - Red: `bg-red-100 text-red-800`
  - Blue: `bg-blue-100 text-blue-800`
  - Yellow: `bg-yellow-100 text-yellow-800`

---

## Next Steps (Phase 5D+)

Phase 5C is complete. Future enhancements could include:

### Phase 5D: Advanced Built-in Tools

- Calendar integration (read/write events)
- Email sending
- Database writes (create todos, notes)
- Real web search

### Phase 5E: Tool Analytics

- Most/least used tools
- Average execution times
- Failure rates
- Cost per tool

### Phase 6: Tool Management UI

- Create custom tools via UI
- Tool marketplace
- Tool permissions and sharing

---

## Summary

Phase 5C successfully implements tool call UI updates:

✅ **Hook created** for real-time tool call subscriptions
✅ **Timeline component** with collapsible cards
✅ **Run card component** encapsulates run+tool call display
✅ **WorkspaceDetailPage updated** to use new components
✅ **Status badges** color-coded for instant understanding
✅ **Detailed views** show parameters, results, errors
✅ **Real-time updates** as tools execute
✅ **TypeScript and ESLint** passing

Tool calls are now fully visible in the UI, enabling powerful debugging, analysis, and understanding of agent behavior.

**Phase 5C Status**: ✅ Complete
