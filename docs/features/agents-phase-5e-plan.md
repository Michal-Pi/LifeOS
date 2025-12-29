# AI Agent Framework - Phase 5E: Error Handling & Reliability

**Status**: Planning
**Created**: December 29, 2025

---

## Overview

Phase 5E adds robust error handling, retry logic, timeouts, rate limiting, and quota management to the AI Agent Framework. This phase focuses on making the system production-ready by handling failures gracefully and preventing resource abuse.

---

## Current State Analysis

### Existing Error Handling

**Good**:

- Basic try/catch blocks in `toolExecutor.ts`, `runExecutor.ts`, `workflowExecutor.ts`
- Error messages stored in Firestore (run status, tool call status)
- Tool call failures tracked with `status: 'failed'` and error messages

**Issues**:

1. **No retry logic**: Transient failures (network issues, rate limits) cause permanent failures
2. **No timeouts**: Long-running tools can hang indefinitely
3. **Generic error messages**: Errors like "Tool execution failed" don't help users debug
4. **No rate limiting**: Users can spam expensive API calls
5. **No quota management**: No cost/token limits per user
6. **No circuit breakers**: Repeated failures to same provider don't trigger protective measures

---

## Implementation Plan

### 1. Retry Logic for Tool Calls

**Location**: `functions/src/agents/toolExecutor.ts`

**Features**:

- Exponential backoff for retries (1s, 2s, 4s, 8s)
- Configurable max retries (default: 3)
- Only retry on transient errors (network, timeout, rate limit)
- Don't retry on permanent errors (invalid params, auth failures)
- Track retry attempts in tool call records

**Implementation**:

```typescript
interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  retryableErrors: string[] // Error types that should trigger retry
}

async function executeToolWithRetry(
  toolCall: ToolCall,
  context: ToolExecutionContext,
  config: RetryConfig
): Promise<ToolResult>
```

**Retryable Errors**:

- Network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND)
- Rate limit errors (429 status, "rate limit" in message)
- Temporary provider errors (500, 502, 503, 504)
- Timeout errors

**Non-Retryable Errors**:

- Invalid parameters (400)
- Authentication failures (401, 403)
- Not found (404)
- Tool logic errors

---

### 2. Timeout Handling

**Location**: `functions/src/agents/toolExecutor.ts`, provider services

**Features**:

- Configurable timeout per tool (default: 30s)
- Configurable timeout per provider call (default: 60s)
- Configurable timeout for entire run (default: 300s - already set in Cloud Function)
- Graceful timeout with proper cleanup

**Implementation**:

```typescript
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T>

// Tool-level timeout
const TOOL_TIMEOUT_MS = {
  default: 30000,
  web_search: 15000,
  query_firestore: 10000,
  create_calendar_event: 10000,
  // ... per-tool configuration
}

// Provider-level timeout
const PROVIDER_TIMEOUT_MS = 60000
```

**Tracking**:

- Record timeout errors separately in tool call records
- Update run status if entire run times out
- Clean up any pending operations on timeout

---

### 3. Better Error Messages

**Location**: All service files (`toolExecutor.ts`, `providerService.ts`, provider services)

**Features**:

- User-friendly error messages (no stack traces to users)
- Actionable error messages (tell users what to do)
- Error categorization (network, auth, rate limit, validation, internal)
- Detailed logging (for debugging) vs. user-facing messages

**Implementation**:

```typescript
class AgentError extends Error {
  constructor(
    message: string,
    public userMessage: string,
    public category: 'network' | 'auth' | 'rate_limit' | 'validation' | 'internal',
    public retryable: boolean,
    public details?: Record<string, unknown>
  )
}

// Example usage:
throw new AgentError(
  'Network request failed: ECONNREFUSED',
  'Unable to connect to AI provider. Please try again.',
  'network',
  true,
  { provider: 'openai', error: 'ECONNREFUSED' }
)
```

**Error Message Mapping**:

| Error Type              | User Message                                               |
| ----------------------- | ---------------------------------------------------------- |
| Network timeout         | "Request timed out. Please try again."                     |
| Rate limit (provider)   | "Too many requests to AI provider. Please wait a moment."  |
| Rate limit (user quota) | "You've exceeded your usage limit. Please try again later" |
| Invalid API key         | "AI provider authentication failed. Please check settings" |
| Tool not found          | "Tool '{name}' is not available"                           |
| Invalid tool params     | "Invalid parameters for tool '{name}': {details}"          |

---

### 4. Rate Limiting per User

**Location**: New file `functions/src/agents/rateLimiter.ts`

**Features**:

- Firestore-based rate limiting (use existing infrastructure)
- Per-user limits (runs per hour, tokens per day)
- Per-provider limits (calls per minute to avoid provider rate limits)
- Grace period for new users
- Admin override capability

**Data Model**:

```typescript
// Firestore: users/{userId}/agentUsage/rateLimits
interface RateLimitRecord {
  userId: UserId
  windowStartMs: number
  windowEndMs: number

  // Run limits
  runsInWindow: number
  maxRunsPerHour: number

  // Token limits
  tokensInWindow: number
  maxTokensPerDay: number

  // Provider call limits (per provider)
  providerCalls: Record<ModelProvider, number>
  maxProviderCallsPerMinute: number

  // Cost limits
  costInWindow: number // USD
  maxCostPerDay: number // USD
}
```

**Default Limits** (configurable per user):

- 20 runs per hour
- 100,000 tokens per day
- 30 provider calls per minute (per provider)
- $1.00 per day

**Implementation**:

```typescript
async function checkRateLimit(userId: string, estimatedTokens: number): Promise<void> {
  // Throws AgentError if rate limit exceeded
}

async function recordUsage(
  userId: string,
  tokensUsed: number,
  cost: number,
  provider: string
): Promise<void>
```

**Integration Points**:

- Check before starting run (in `runExecutor.ts`)
- Check before each provider call (in `providerService.ts`)
- Update after run completion

---

### 5. Quota Management

**Location**: `functions/src/agents/quotaManager.ts`

**Features**:

- Track usage over time (daily, weekly, monthly)
- Budget alerts (email user at 50%, 80%, 100% of quota)
- Hard limits vs. soft limits (soft = warning, hard = block)
- Usage analytics (tokens, cost, runs by provider)
- Admin dashboard data

**Data Model**:

```typescript
// Firestore: users/{userId}/agentUsage/quotas
interface QuotaRecord {
  userId: UserId
  period: 'daily' | 'weekly' | 'monthly'
  periodStartMs: number
  periodEndMs: number

  // Usage tracking
  totalRuns: number
  totalTokens: number
  totalCost: number
  usageByProvider: Record<
    ModelProvider,
    {
      runs: number
      tokens: number
      cost: number
    }
  >

  // Quota limits
  maxRuns: number
  maxTokens: number
  maxCost: number

  // Alerts
  alertsSent: Array<{
    threshold: number // 50, 80, 100
    sentAtMs: number
    type: 'runs' | 'tokens' | 'cost'
  }>
}
```

**Implementation**:

```typescript
async function checkQuota(userId: string): Promise<void>

async function updateQuota(
  userId: string,
  tokensUsed: number,
  cost: number,
  provider: string
): Promise<void>

async function shouldSendAlert(userId: string): Promise<AlertInfo | null>
```

**Integration**:

- Check quota before starting run
- Update quota after run completion
- Send alerts via Cloud Functions (separate function)

---

### 6. Circuit Breaker Pattern (Optional - Future Enhancement)

**Location**: `functions/src/agents/circuitBreaker.ts`

**Features** (for future implementation):

- Track failure rate per provider
- Open circuit after N consecutive failures
- Half-open state for testing recovery
- Automatic recovery after cooldown

---

## File Changes

### New Files

1. `functions/src/agents/rateLimiter.ts` - Rate limiting logic
2. `functions/src/agents/quotaManager.ts` - Quota management
3. `functions/src/agents/errorHandler.ts` - Error classification and messages
4. `functions/src/agents/retryHelper.ts` - Retry logic with exponential backoff

### Modified Files

1. `functions/src/agents/toolExecutor.ts` - Add retry, timeout, better errors
2. `functions/src/agents/providerService.ts` - Add timeout, rate limit checks
3. `functions/src/agents/runExecutor.ts` - Add quota checks, rate limit checks
4. `functions/src/agents/workflowExecutor.ts` - Propagate errors properly
5. `functions/src/agents/openaiService.ts` - Better error handling
6. `functions/src/agents/anthropicService.ts` - Better error handling
7. `functions/src/agents/googleService.ts` - Better error handling
8. `functions/src/agents/grokService.ts` - Better error handling

### Data Model Changes

1. Add `users/{userId}/agentUsage/rateLimits` collection
2. Add `users/{userId}/agentUsage/quotas` collection
3. Add `retryAttempt` field to tool call records
4. Add `errorCategory` field to tool call records
5. Add `quotaExceeded` field to run records

---

## Implementation Phases

### Phase 5E.1: Retry Logic & Timeouts

**Estimated Time**: 1 session

1. Create `retryHelper.ts` with exponential backoff
2. Create timeout utility in `errorHandler.ts`
3. Update `toolExecutor.ts` to use retry logic
4. Update provider services with timeouts
5. Test with simulated failures

### Phase 5E.2: Better Error Messages

**Estimated Time**: 1 session

1. Create `AgentError` class in `errorHandler.ts`
2. Map error types to user-friendly messages
3. Update all error handling to use `AgentError`
4. Update UI to display user-friendly errors
5. Test error scenarios

### Phase 5E.3: Rate Limiting

**Estimated Time**: 1 session

1. Create `rateLimiter.ts` with Firestore tracking
2. Add rate limit checks to `runExecutor.ts`
3. Add rate limit checks to `providerService.ts`
4. Create rate limit error responses
5. Test rate limit enforcement

### Phase 5E.4: Quota Management

**Estimated Time**: 1 session

1. Create `quotaManager.ts` with usage tracking
2. Add quota checks to `runExecutor.ts`
3. Update run completion to record usage
4. Create quota alert function (optional)
5. Test quota tracking and limits

---

## Testing Plan

### Unit Tests

- Retry logic with mock failures
- Timeout handling with delayed promises
- Error message formatting
- Rate limit calculations
- Quota tracking

### Integration Tests

- End-to-end run with retries
- Tool timeout scenarios
- Rate limit enforcement
- Quota enforcement
- Multiple providers with different failures

### Manual Tests

- Trigger network errors (disconnect wifi)
- Trigger rate limits (spam runs)
- Trigger timeouts (slow tools)
- Verify error messages in UI
- Verify quota tracking in Firestore

---

## Success Criteria

- ✅ Transient failures retry automatically (3 attempts with exponential backoff)
- ✅ Long-running operations timeout gracefully (no hangs)
- ✅ Error messages are user-friendly and actionable
- ✅ Users cannot exceed rate limits (runs/hour, tokens/day)
- ✅ Usage is tracked and quota alerts fire at thresholds
- ✅ No degradation in successful run performance
- ✅ All existing tests still pass

---

## Configuration

### Environment Variables (Firebase Functions)

```bash
# Rate limits (optional overrides, defaults in code)
AGENT_MAX_RUNS_PER_HOUR=20
AGENT_MAX_TOKENS_PER_DAY=100000
AGENT_MAX_COST_PER_DAY=1.00

# Timeouts (optional overrides)
AGENT_TOOL_TIMEOUT_MS=30000
AGENT_PROVIDER_TIMEOUT_MS=60000

# Retry config (optional overrides)
AGENT_MAX_RETRIES=3
AGENT_INITIAL_RETRY_DELAY_MS=1000
```

### Per-User Configuration (Future)

Admin interface to set custom limits per user:

- Premium users: Higher quotas
- Enterprise users: Custom quotas
- Trial users: Lower quotas

---

## Rollout Plan

1. **Phase 5E.1**: Deploy retry and timeout logic (low risk, high value)
2. **Phase 5E.2**: Deploy better error messages (no breaking changes)
3. **Phase 5E.3**: Deploy rate limiting with generous defaults (monitor usage)
4. **Phase 5E.4**: Deploy quota management (start with warnings, not hard blocks)

Monitor for 1 week after each phase before proceeding to next.

---

## Future Enhancements (Phase 6+)

- Circuit breaker pattern for provider failures
- Adaptive timeouts based on historical performance
- Cost optimization (auto-select cheapest model for task)
- User notification system for quota alerts (email, in-app)
- Advanced analytics dashboard
- Per-workspace quotas (team budgets)

---

## Questions for User

1. **Rate Limits**: Are the default limits (20 runs/hour, 100k tokens/day, $1/day) appropriate?
2. **Quota Alerts**: Should we send email alerts or just in-app notifications?
3. **Error Messages**: Should we expose technical details to users or keep fully user-friendly?
4. **Retries**: 3 retries with exponential backoff OK, or different strategy?
5. **Priority**: Which sub-phase is most important? (Retry, timeout, rate limit, quota)

---

**Next Steps**: Review plan with user, then proceed with Phase 5E.1 implementation.
