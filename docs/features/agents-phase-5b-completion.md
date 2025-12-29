# AI Agent Framework - Phase 5B: Tool Call Persistence

## Overview

**Status**: ✅ Complete
**Date**: December 29, 2025
**Objective**: Persist tool call execution records to Firestore for tracking, analytics, and debugging

Phase 5B implements comprehensive persistence for all tool call executions across all four AI providers (OpenAI, Anthropic, Google, xAI/Grok). Every tool call is now tracked from initiation to completion, including timing metrics, cost estimates, and execution results.

---

## What Was Implemented

### 1. Domain Model (`packages/agents/src/domain/models.ts`)

**New Types**:

```typescript
export type ToolCallRecordId = Id<'toolCallRecord'>
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed'
```

**New Interface**:

```typescript
export interface ToolCallRecord {
  toolCallRecordId: ToolCallRecordId
  runId: RunId
  workspaceId: WorkspaceId
  userId: string
  agentId: AgentId

  // Tool execution details
  toolCallId: string // Provider-specific ID (e.g., OpenAI call_xyz, Anthropic toolu_xyz)
  toolName: string
  toolId: ToolId
  parameters: Record<string, unknown>

  // Execution status
  status: ToolCallStatus
  result?: unknown
  error?: string

  // Timing metrics
  startedAtMs: number
  completedAtMs?: number
  durationMs?: number

  // Cost tracking
  tokensUsed?: number
  estimatedCost?: number

  // Provider context
  provider: ModelProvider
  modelName: string
  iteration: number // Which iteration of agent execution (1-5)

  syncState: SyncState
  version: number
}
```

**Input Type**:

```typescript
export type CreateToolCallRecordInput = Omit<
  ToolCallRecord,
  'toolCallRecordId' | 'syncState' | 'version' | 'completedAtMs' | 'durationMs' | 'result' | 'error'
>
```

### 2. Repository Interface (`packages/agents/src/ports/toolCallRecordRepository.ts`)

**New Repository Interface**:

```typescript
export interface ToolCallRecordRepository {
  createToolCallRecord(input: CreateToolCallRecordInput): Promise<ToolCallRecord>
  updateToolCallRecord(id: ToolCallRecordId, updates: Partial<ToolCallRecord>): Promise<ToolCallRecord>
  getToolCallRecord(id: ToolCallRecordId): Promise<ToolCallRecord | null>
  getToolCallRecordsByRun(runId: RunId): Promise<ToolCallRecord[]>
  getToolCallRecordsByWorkspace(workspaceId: WorkspaceId): Promise<ToolCallRecord[]>
  getToolCallRecordsByUser(userId: string): Promise<ToolCallRecord[]>
  deleteToolCallRecord(id: ToolCallRecordId): Promise<void>
}
```

**Key Methods**:

- `createToolCallRecord`: Create new tool call record
- `updateToolCallRecord`: Update record with completion status/result
- Query by: run, workspace, or user
- Delete tool call records

### 3. Firestore Adapter (`apps/web-vite/src/adapters/agents/firestoreToolCallRecordRepository.ts`)

**Implementation Details**:

- Uses Firestore subcollection: `users/{userId}/runs/{runId}/toolCalls/{toolCallRecordId}`
- Implements all repository interface methods
- Supports cross-run and cross-workspace queries
- Follows existing adapter patterns (versioning, sync state)

**Query Patterns**:

- **By Run**: Direct subcollection query (efficient)
- **By Workspace**: Scans runs, filters by workspaceId (less efficient)
- **By User**: Scans all user runs (least efficient)

### 4. Tool Executor Persistence (`functions/src/agents/toolExecutor.ts`)

**New Context Types**:

```typescript
export interface BaseToolExecutionContext {
  userId: string
  agentId: string
  workspaceId: string
  runId: string
}

export interface ToolExecutionContext extends BaseToolExecutionContext {
  provider: ModelProvider
  modelName: string
  iteration: number
}
```

**Execution Flow with Persistence**:

1. **Create pending record** before execution
2. **Update to running** when tool starts
3. **Update to completed/failed** with results
4. **Track timing** (startedAtMs, completedAtMs, durationMs)
5. **Version tracking** (increments with each update)

**Code Example**:

```typescript
export async function executeTool(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const startTime = Date.now()
  const db = getFirestore()

  // Create document reference with auto-generated ID
  const toolCallDocRef = db
    .collection('users')
    .doc(context.userId)
    .collection('runs')
    .doc(context.runId)
    .collection('toolCalls')
    .doc() // Auto-generate ID

  // Create pending record
  const toolCallRecord = {
    // ... all fields
    status: 'pending',
  }
  await toolCallDocRef.set(toolCallRecord)

  // Update to running
  await toolCallDocRef.update({ status: 'running' })

  // Execute tool
  const result = await tool.execute(params, context)

  // Update to completed with result
  await toolCallDocRef.update({
    status: 'completed',
    result,
    completedAtMs: Date.now(),
    durationMs: Date.now() - startTime,
  })
}
```

### 5. Provider Service Updates

**All Four Providers Updated**:

- `openaiService.ts`
- `anthropicService.ts`
- `googleService.ts`
- `grokService.ts`

**Changes**:

- Accept `BaseToolExecutionContext` (without provider/modelName/iteration)
- Augment context when calling `executeTools`:

```typescript
const toolResults = await executeTools(toolCalls, {
  ...toolContext,
  provider: 'openai',
  modelName,
  iteration,
})
```

**Separation of Concerns**:

- Workflow executor provides base context (userId, agentId, workspaceId, runId)
- Provider services add provider-specific context (provider, modelName, iteration)
- Tool executor uses full context for persistence

---

## Firestore Schema

### Path

```
users/{userId}/runs/{runId}/toolCalls/{toolCallRecordId}
```

### Benefits

✅ **Hierarchical**: Tool calls naturally belong to runs
✅ **Efficient queries**: Can list all tool calls for a run
✅ **Security**: User-scoped, runs already have user ID
✅ **Lifecycle**: Tool calls deleted when run is deleted

### Example Document

```json
{
  "toolCallRecordId": "toolCallRecord:abc123",
  "runId": "run:xyz789",
  "workspaceId": "workspace:def456",
  "userId": "user123",
  "agentId": "agent:researcher",

  "toolCallId": "call_abc123xyz", // Provider-specific
  "toolName": "query_firestore",
  "toolId": "tool:query_firestore",
  "parameters": {
    "collection": "todos",
    "limit": 10
  },

  "status": "completed",
  "result": {
    "collection": "todos",
    "count": 5,
    "documents": [...]
  },

  "startedAtMs": 1735491234567,
  "completedAtMs": 1735491235123,
  "durationMs": 556,

  "tokensUsed": null, // Not tracked per tool call yet
  "estimatedCost": null,

  "provider": "openai",
  "modelName": "gpt-4o-mini",
  "iteration": 2,

  "syncState": "synced",
  "version": 3
}
```

---

## Provider-Specific Tool Call IDs

Each provider uses different formats for tool call IDs:

| Provider  | ID Format           | Example                                       |
| --------- | ------------------- | --------------------------------------------- |
| OpenAI    | `call_<hash>`       | `call_abc123xyz`                              |
| Anthropic | `toolu_<hash>`      | `toolu_def456uvw`                             |
| Google    | Function name       | `get_current_time` (no unique IDs provided)   |
| Grok      | `call_<hash>` (xAI) | `call_ghi789rst` (OpenAI-compatible API used) |

The `toolCallId` field stores the provider-specific identifier for debugging and correlation.

---

## Lifecycle & Status Tracking

### Status States

1. **`pending`**: Tool call created, execution not started
2. **`running`**: Tool execution in progress
3. **`completed`**: Tool executed successfully, result available
4. **`failed`**: Tool execution failed, error message available

### Timing Metrics

- **`startedAtMs`**: When tool call was initiated
- **`completedAtMs`**: When tool finished (success or failure)
- **`durationMs`**: Total execution time in milliseconds

### Version Tracking

- **Version 1**: Initial pending record created
- **Version 2**: Updated to running status
- **Version 3**: Updated to completed/failed with results

---

## Use Cases Enabled

### 1. Debugging Tool Failures

Query all failed tool calls for a user:

```typescript
const toolCalls = await toolCallRecordRepo.getToolCallRecordsByUser(userId)
const failed = toolCalls.filter((tc) => tc.status === 'failed')
```

### 2. Performance Analytics

Calculate average tool execution times:

```typescript
const toolCalls = await toolCallRecordRepo.getToolCallRecordsByWorkspace(workspaceId)
const avgDuration = toolCalls.reduce((sum, tc) => sum + (tc.durationMs || 0), 0) / toolCalls.length
```

### 3. Cost Tracking

Track which tools are expensive:

```typescript
const toolCalls = await toolCallRecordRepo.getToolCallRecordsByRun(runId)
const costByTool = toolCalls.reduce((acc, tc) => {
  acc[tc.toolName] = (acc[tc.toolName] || 0) + (tc.estimatedCost || 0)
  return acc
}, {})
```

### 4. Run Replay & Debugging

Reconstruct exact sequence of tool calls:

```typescript
const toolCalls = await toolCallRecordRepo.getToolCallRecordsByRun(runId)
toolCalls.sort((a, b) => a.startedAtMs - b.startedAtMs)
// See exactly what the agent did, in order
```

### 5. Tool Usage Metrics

Which tools are most/least used:

```typescript
const toolCalls = await toolCallRecordRepo.getToolCallRecordsByUser(userId)
const usage = toolCalls.reduce((acc, tc) => {
  acc[tc.toolName] = (acc[tc.toolName] || 0) + 1
  return acc
}, {})
```

---

## Testing

### TypeScript Compilation

```bash
pnpm --filter @lifeos/agents typecheck  # ✅ Passed
pnpm --filter functions typecheck       # ✅ Passed
pnpm --filter web-vite typecheck        # ✅ Passed
```

### Build

```bash
pnpm --filter @lifeos/agents build  # ✅ Passed
pnpm --filter functions build       # ✅ Passed
```

---

## Architecture Patterns

### 1. Separation of Concerns

- **Domain Layer**: Pure TypeScript models (`ToolCallRecord`)
- **Repository Port**: Interface contract (`ToolCallRecordRepository`)
- **Firestore Adapter**: Concrete implementation (web-vite)
- **Tool Executor**: Persistence logic (functions)

### 2. Context Augmentation

- **Workflow Executor**: Provides base context
- **Provider Services**: Add provider-specific fields
- **Tool Executor**: Uses full context for persistence

### 3. Auto-Generated IDs

- Uses Firestore's `.doc()` without parameter
- Generates unique ID automatically
- Avoids dependency on `@lifeos/core` in functions

### 4. Idempotency-Safe

- Status transitions are one-way (pending → running → completed/failed)
- Version field prevents concurrent update conflicts
- Each status update increments version

---

## Files Modified

### Domain & Ports (packages/agents)

- `src/domain/models.ts`: Added `ToolCallRecord`, `ToolCallRecordId`, `ToolCallStatus`
- `src/ports/toolCallRecordRepository.ts`: New repository interface
- `src/index.ts`: Exported new types and repository

### Adapters (apps/web-vite)

- `src/adapters/agents/firestoreToolCallRecordRepository.ts`: New Firestore adapter

### Functions (functions/src/agents)

- `toolExecutor.ts`: Added persistence to `executeTool()`, new context types
- `openaiService.ts`: Updated to use `BaseToolExecutionContext`, augment with provider context
- `anthropicService.ts`: Same as OpenAI
- `googleService.ts`: Same as OpenAI
- `grokService.ts`: Same as OpenAI
- `providerService.ts`: Updated to accept `BaseToolExecutionContext`

---

## Next Steps (Phase 5C+)

Phase 5B is complete. Future phases could include:

### Phase 5C: Tool Call UI

- Display tool call history in WorkspaceDetailPage
- Show tool call timeline per run
- Filter/search tool calls

### Phase 5D: Tool Call Analytics

- Dashboard for tool usage metrics
- Cost analysis per tool
- Performance trends

### Phase 5E: Tool Call Debugging

- Replay tool calls
- Inspect parameters and results
- Retry failed tool calls

---

## Summary

Phase 5B successfully implements tool call persistence across all AI providers:

✅ **Domain models** define ToolCallRecord structure
✅ **Repository interface** provides persistence contract
✅ **Firestore adapter** implements storage in web-vite
✅ **Tool executor** persists all executions in functions
✅ **Provider services** augment context with provider details
✅ **Status tracking** monitors lifecycle (pending → running → completed/failed)
✅ **Timing metrics** track execution duration
✅ **Query support** enables analytics and debugging

All tool calls are now fully tracked, enabling powerful debugging, analytics, and cost optimization workflows.

**Phase 5B Status**: ✅ Complete
