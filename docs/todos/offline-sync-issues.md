# Todo Offline Sync - Conflict Resolution & Potential Issues

## Current Conflict Resolution Strategy

### Pull Phase (Remote → Local)

- **Strategy**: Last-Write-Wins based on `updatedAt` timestamp
- **Implementation**:
  ```typescript
  if (!localEntity || remoteEntity.updatedAt >= localEntity.updatedAt) {
    await saveLocally({ ...remoteEntity, syncState: 'synced' })
  }
  ```
- **Applies to**: Projects ✅, Tasks ✅, Chapters ❌ (missing!)

### Push Phase (Local → Remote)

- **Strategy**: No conflict detection - direct overwrite
- **Issue**: Outbox operations don't check if server state has changed
- **Current behavior**:
  - Update operations merge with **local** state, not server state
  - If server has newer data, local changes overwrite it

## Identified Issues

### 🔴 Critical Issues

#### 1. **Chapters Missing Conflict Resolution**

**Location**: `syncWorker.ts:372-390`

```typescript
async function pullRemoteChapters(userId: string): Promise<void> {
  // ❌ No timestamp comparison - always overwrites local
  for (const chapter of remoteChapters) {
    await saveChapterLocally({ ...chapter, syncState: 'synced' })
  }
}
```

**Fix**: Add timestamp comparison like projects/tasks:

```typescript
const localChapterMap = new Map(localChapters.map((c) => [c.id, c]))
for (const remoteChapter of remoteChapters) {
  const localChapter = localChapterMap.get(remoteChapter.id)
  if (!localChapter || remoteChapter.updatedAt >= localChapter.updatedAt) {
    await saveChapterLocally({ ...remoteChapter, syncState: 'synced' })
  }
}
```

#### 2. **No Conflict Detection During Push**

**Location**: `syncWorker.ts:116-137`

When processing update operations, we merge with local state but don't check server state:

```typescript
case 'update': {
  const existing = existingProject || (await getProjectLocally(op.projectId))
  // ❌ Uses local state, not server state
  const updated: LocalProject = {
    ...existing,  // This is local, might be stale!
    ...payload.updates,
    updatedAt: new Date().toISOString(),
  }
  await todoRepository.saveProject(updated) // Overwrites server
}
```

**Problem**: If server has newer data, we overwrite it with stale local data.

**Fix**: Fetch server state first, then merge:

```typescript
case 'update': {
  // Fetch current server state
  const serverProjects = await todoRepository.getProjects(userId)
  const serverProject = serverProjects.find(p => p.id === op.projectId)
  const baseProject = serverProject || existingProject

  // Merge server state with updates
  const updated: LocalProject = {
    ...baseProject,
    ...payload.updates,
    updatedAt: new Date().toISOString(),
  }

  // Only save if our update is newer or no server version exists
  if (!serverProject || updated.updatedAt >= serverProject.updatedAt) {
    await todoRepository.saveProject(updated)
  } else {
    // Conflict: server is newer, need to resolve
    // Option 1: Merge intelligently
    // Option 2: Use server version and re-queue update
    // Option 3: Mark as conflict for user resolution
  }
}
```

### 🟡 Medium Priority Issues

#### 3. **Race Condition: Pull vs Push**

**Scenario**:

1. Device A updates task (offline) → queued
2. Device B updates same task → synced to server
3. Device A comes online → pulls remote (gets B's changes)
4. Device A processes outbox → overwrites B's changes

**Current behavior**: Last sync wins (could be A or B depending on timing)

**Better approach**: Process outbox BEFORE pulling remote changes, or use revision numbers.

#### 4. **Deleted Entity Conflicts**

**Scenario**:

- Local: Delete queued (offline)
- Remote: Update happened (online)
- On sync: Delete wins, update is lost

**Current behavior**: Delete operation doesn't check if server has updates

**Fix**: Before deleting, check if server has newer data:

```typescript
case 'delete': {
  const serverProjects = await todoRepository.getProjects(userId)
  const serverProject = serverProjects.find(p => p.id === op.projectId)

  if (serverProject) {
    const localProject = await getProjectLocally(op.projectId)
    // Only delete if local delete is newer than server update
    if (!localProject || localProject.updatedAt >= serverProject.updatedAt) {
      await todoRepository.deleteProject(userId, op.projectId)
    } else {
      // Server has newer data - cancel delete, use server version
      await markProjectOpApplied(op.opId)
      await saveProjectLocally({ ...serverProject, syncState: 'synced' })
      return
    }
  }
  await deleteProjectLocally(op.projectId)
}
```

#### 5. **No Revision Numbers**

Unlike calendar events, todos don't have revision numbers (`rev` field).

**Impact**:

- Can't detect conflicts during push operations
- Can't implement optimistic concurrency control
- Must rely solely on timestamps (which can be equal)

**Consideration**: Add `rev` field to todos for better conflict detection.

#### 6. **Timestamp Precision**

Using ISO strings (`updatedAt: string`) instead of milliseconds.

**Issue**: String comparison might not work correctly:

```typescript
'2024-01-01T12:00:00.000Z' >= '2024-01-01T12:00:00.001Z' // false, but close!
```

**Better**: Use `updatedAtMs: number` for precise comparison, or ensure ISO strings are compared correctly.

### 🟢 Low Priority / Edge Cases

#### 7. **Initial Load Race Condition**

**Location**: `useTodoOperations.ts:82-103`

Background Firestore fetch might complete before IndexedDB is ready, causing state inconsistencies.

**Mitigation**: Already handled with Promise.all, but could add explicit ordering.

#### 8. **Sync State Management**

Entities with `syncState: 'pending'` are overwritten during pull, losing the fact that they have pending changes.

**Current**: Pull sets everything to `'synced'`, even if local has pending changes.

**Better**: Only mark as `'synced'` if no pending outbox operations exist.

#### 9. **Partial Updates**

Update operations send full entity, not just changed fields.

**Impact**: Larger payloads, but simpler implementation.

**Consideration**: Could optimize to send only changed fields.

## Recommendations

### Immediate Fixes

1. ✅ **Fix chapters conflict resolution** - Add timestamp comparison
2. ✅ **Add server state check in update operations** - Fetch before updating
3. ✅ **Handle deleted entity conflicts** - Check server state before deleting

### Future Enhancements

1. **Add revision numbers** (`rev` field) to todos for better conflict detection
2. **Use milliseconds** (`updatedAtMs`) instead of ISO strings for timestamps
3. **Implement merge strategy** for field-level conflicts (like notes)
4. **Add conflict resolution UI** for user intervention when needed
5. **Process outbox before pull** to reduce race conditions

### Conflict Resolution Strategy Options

#### Option A: Enhanced Last-Write-Wins (Current + Fixes)

- ✅ Simple to implement
- ✅ Predictable behavior
- ❌ Can lose user data in conflicts
- ❌ No user control

#### Option B: Revision-Based (Like Calendar Events)

- ✅ Detects conflicts early
- ✅ Prevents stale updates
- ✅ Deterministic resolution
- ❌ Requires schema changes (`rev` field)
- ❌ More complex implementation

#### Option C: Field-Level Merging (Like Notes)

- ✅ Preserves most user changes
- ✅ User can resolve conflicts
- ❌ Complex UI required
- ❌ Slower sync process

## Current Status

- ✅ Basic offline-first storage working
- ✅ Outbox queuing working
- ✅ Sync worker processing operations
- ⚠️ Conflict resolution needs improvement
- ⚠️ Chapters missing conflict resolution
- ⚠️ Push operations don't check server state
