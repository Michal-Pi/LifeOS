# Cloud Functions Deployment Timeout Fix

## Problem

Firebase Functions v2 deployment fails with health check timeout errors:

```
Container Healthcheck failed. Revision is not ready and cannot serve traffic.
The user-provided container failed to start and listen on the port defined
by PORT=8080 within the allocated timeout.
```

## Root Cause

Cloud Functions v2 runs on the 2nd Gen runtime, which has stricter health check requirements:

1. **Default timeout**: 60 seconds (often too short for cold starts with dependencies)
2. **Health check**: Container must respond to HTTP requests within timeout
3. **Large dependencies**: Firebase SDK + Google APIs = slower cold starts

## Solutions

### Solution 1: Retry Deployment (Quickest)

The first deployment builds the container. Subsequent deployments use cached layers.

```bash
# Simply retry - will likely succeed
firebase deploy --only functions
```

**Success Rate:** ~90% on second attempt

---

### Solution 2: Increase Function Timeout (Recommended)

Update `functions/src/index.ts` to add timeout configuration to each function.

**Before:**

```typescript
export const syncNow = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
  },
  async (request, response) => {
    // ...
  }
)
```

**After:**

```typescript
export const syncNow = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
    timeoutSeconds: 300, // 5 minutes (default is 60s)
    memory: '512MiB', // More memory = faster cold starts
  },
  async (request, response) => {
    // ...
  }
)
```

**Apply to all HTTP functions:**

- `googleAuthStart`
- `googleAuthCallback`
- `googleDisconnect`
- `syncNow`
- `enqueueWriteback`
- `retryWriteback`
- `processWritebackQueue`
- `recomputeCompositesEndpoint`
- `attendeeFreeBusy`
- `getFirebaseConfig`

**Scheduled functions:**

```typescript
export const scheduleSync = onSchedule(
  {
    schedule: 'every 24 hours',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    timeoutSeconds: 540, // 9 minutes (max for scheduled functions)
    memory: '512MiB',
  },
  async () => {
    // ...
  }
)
```

---

### Solution 3: Optimize Cold Start Performance

#### 3.1 Lazy Load Heavy Dependencies

Instead of loading all dependencies at module level, load them when needed:

**Before:**

```typescript
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
// ... all imports at top
```

**After:**

```typescript
// Only import types at top level
import type { Request, Response } from 'express'

// Lazy load in functions
async function verifyAuth(request: Request, response: Response, uid: string): Promise<boolean> {
  const { getAuth } = await import('firebase-admin/auth') // Lazy load
  // ...
}
```

#### 3.2 Use Minimal Instances

For low-traffic functions, use `minInstances: 0` and `maxInstances: 1`:

```typescript
export const syncNow = onRequest(
  {
    secrets: ['...'],
    cors: true,
    timeoutSeconds: 300,
    minInstances: 0, // No always-on instances (save costs)
    maxInstances: 10, // Scale up to 10 concurrent instances
  },
  async (request, response) => {
    // ...
  }
)
```

#### 3.3 Optimize Dependencies

Check bundle size:

```bash
cd functions
du -sh node_modules
```

Consider:

- Using `firebase-admin/app` instead of full `firebase-admin`
- Tree-shaking unused Google API services
- Removing unused dependencies

---

### Solution 4: Pre-warm Functions (Production)

Keep functions warm to avoid cold starts:

```typescript
export const syncNow = onRequest(
  {
    secrets: ['...'],
    cors: true,
    minInstances: 1, // Keep 1 instance always running
    timeoutSeconds: 300,
  },
  async (request, response) => {
    // ...
  }
)
```

**Cost:** ~$6-12/month per always-on function
**Benefit:** Near-instant response times

---

## Recommended Implementation Plan

### Step 1: Immediate Fix (5 minutes)

Simply retry the deployment:

```bash
firebase deploy --only functions
```

### Step 2: Short-term Fix (15 minutes)

Add timeout configuration to all functions in `functions/src/index.ts`:

```typescript
// Create shared config
const FUNCTION_CONFIG = {
  http: {
    timeoutSeconds: 300,
    memory: '512MiB' as const,
    cors: true,
  },
  scheduled: {
    timeoutSeconds: 540,
    memory: '512MiB' as const,
  },
}

// Use in functions
export const syncNow = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async (request, response) => {
    // ...
  }
)
```

### Step 3: Medium-term Optimization (1-2 hours)

- Audit and optimize dependencies
- Lazy load heavy modules
- Add performance monitoring

### Step 4: Production Hardening (optional)

- Add `minInstances: 1` for critical functions
- Monitor cold start metrics in Firebase Console
- Set up alerting for function errors

---

## Testing

After applying fixes, test deployment:

```bash
# Full deployment
firebase deploy

# Or functions only
firebase deploy --only functions

# Monitor logs
firebase functions:log --only syncNow
```

Test function endpoint:

```bash
# Get auth token from browser console
const token = await firebase.auth().currentUser.getIdToken()
console.log(token)

# Test endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://us-central1-lifeos-pi.cloudfunctions.net/syncNow?uid=YOUR_UID&accountId=primary"
```

---

## Monitoring

### Firebase Console

1. Go to Firebase Console → Functions
2. Click on each function
3. View:
   - **Invocations** - Call frequency
   - **Execution time** - Cold start performance
   - **Memory usage** - Right-size allocation
   - **Errors** - Track failures

### Google Cloud Console

For more detailed metrics:

1. Go to Cloud Console → Cloud Functions (2nd Gen)
2. Find function services
3. View:
   - Container startup time
   - Request latency
   - Instance count

---

## Prevention

### Future Functions Checklist

When creating new Cloud Functions:

- [ ] Add `timeoutSeconds: 300` for HTTP functions
- [ ] Add `timeoutSeconds: 540` for scheduled functions
- [ ] Set `memory: '512MiB'` for functions with heavy dependencies
- [ ] Consider `minInstances: 0` for cost savings
- [ ] Test locally with `firebase emulators:start`
- [ ] Monitor cold start times after deployment

---

## Alternative: Migrate to 1st Gen Functions

If Functions v2 continues to be problematic, you can migrate to 1st Gen functions:

```typescript
import * as functions from 'firebase-functions' // v1 API

export const syncNow = functions.https.onRequest(async (request, response) => {
  // Same code, different wrapper
})
```

**Trade-offs:**

- ✅ More reliable cold starts
- ✅ Simpler deployment
- ❌ Older architecture
- ❌ Missing 2nd Gen features
- ❌ May be deprecated in future

---

## Summary

**Current Status:** ✅ Functions deployed successfully
**Root Cause:** 2nd Gen runtime health check timeout (default 60s too short for cold starts)
**Solution Applied:** Simple budget-friendly configuration with extended timeout (300s HTTP, 540s scheduled)
**Memory Allocation:** 256MiB (cost-effective for small-scale/low-traffic use)

**Deployment Strategy That Worked:**

1. Added shared `FUNCTION_CONFIG` with `timeoutSeconds: 300` and `memory: '256MiB'`
2. Applied config to all 14 HTTP and scheduled functions
3. Built and deployed - initial attempt failed with health check timeout
4. **Simply retried deployment** - container layers were cached from first attempt
5. ✅ All 14 functions deployed successfully on retry

**Key Learnings:**

- Don't overcomplicate with CPU allocation, scaling, or instance settings for small budgets
- Simple timeout extension (300s) is sufficient
- 256MiB memory is cost-effective and adequate for low traffic
- Container layer caching means retries often succeed even if first deployment fails
- Firebase skips redeployment if no code changes detected

**Priority:** ✅ Resolved
**Effort:** 30 minutes (including troubleshooting)
**Impact:** All Cloud Functions operational and accessible
