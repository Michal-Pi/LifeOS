/**
 * Shared Configuration Constants
 *
 * Centralized configuration for workflow execution, Firestore operations,
 * and evaluation thresholds. Eliminates magic numbers scattered throughout the codebase.
 */

// ----- Retry Settings -----

export const RetryConfig = {
  /** Maximum number of retry attempts for operations */
  MAX_RETRIES: 3,
  /** Initial delay between retries in milliseconds */
  INITIAL_DELAY_MS: 1000,
  /** Multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,
  /** Maximum delay between retries */
  MAX_DELAY_MS: 30000,
} as const

// ----- Timeout Settings -----

export const TimeoutConfig = {
  /** Maximum time for agent execution (5 minutes) */
  AGENT_TIMEOUT_MS: 300000,
  /** Firestore operation timeout (30 seconds) */
  FIRESTORE_TIMEOUT_MS: 30000,
  /** LLM provider request timeout (2 minutes) */
  PROVIDER_TIMEOUT_MS: 120000,
  /** Tool execution timeout (1 minute) */
  TOOL_TIMEOUT_MS: 60000,
} as const

// ----- Workflow Limits -----

export const WorkflowLimits = {
  /** Maximum steps per workflow execution */
  MAX_STEPS_PER_WORKFLOW: 50,
  /** Maximum agents in parallel execution */
  MAX_PARALLEL_AGENTS: 10,
  /** Maximum loop iterations for cyclic graphs */
  MAX_LOOP_ITERATIONS: 100,
  /** Default page size for list queries */
  DEFAULT_PAGE_SIZE: 100,
  /** Maximum page size for list queries */
  MAX_PAGE_SIZE: 500,
} as const

// ----- Evaluation Thresholds -----

export const EvaluationThresholds = {
  /** Threshold for triggering drift alerts (20% deviation) */
  DRIFT_ALERT_THRESHOLD: 0.2,
  /** Threshold for consistency variance warnings */
  CONSISTENCY_VARIANCE_THRESHOLD: 0.15,
  /** Minimum quality score */
  QUALITY_SCORE_MIN: 1,
  /** Maximum quality score */
  QUALITY_SCORE_MAX: 5,
  /** Minimum sample size for statistical significance */
  MIN_SAMPLE_SIZE: 30,
  /** P-value threshold for A/B test significance */
  SIGNIFICANCE_THRESHOLD: 0.05,
} as const

// ----- A/B Testing -----

export const ABTestingConfig = {
  /** Initial alpha for Thompson sampling */
  INITIAL_ALPHA: 1,
  /** Initial beta for Thompson sampling */
  INITIAL_BETA: 1,
  /** Minimum samples before variant promotion */
  MIN_SAMPLES_FOR_PROMOTION: 50,
} as const

// ----- Telemetry -----

export const TelemetryConfig = {
  /** Maximum steps to store per run */
  MAX_STEPS_PER_TELEMETRY: 100,
  /** Default window for metrics aggregation (30 days) */
  DEFAULT_METRICS_WINDOW_DAYS: 30,
  /** Batch size for daily summary computation */
  SUMMARY_BATCH_SIZE: 1000,
} as const

// ----- Human Labeling -----

export const LabelingConfig = {
  /** Default number of labels required for consensus */
  DEFAULT_REQUIRED_LABELS: 2,
  /** Default task expiration (7 days) */
  DEFAULT_TASK_EXPIRATION_DAYS: 7,
  /** Default sampling rate for auto-queuing (10%) */
  DEFAULT_SAMPLING_RATE: 0.1,
} as const

// ----- Hash Settings -----

export const HashConfig = {
  /** Length of content hash for telemetry */
  CONTENT_HASH_LENGTH: 16,
  /** Hash algorithm */
  HASH_ALGORITHM: 'sha256',
} as const

// ----- Error Codes -----

export const ErrorCodes = {
  // Firestore errors
  FIRESTORE_WRITE_FAILED: 'FIRESTORE_WRITE_FAILED',
  FIRESTORE_READ_FAILED: 'FIRESTORE_READ_FAILED',
  FIRESTORE_VALIDATION_FAILED: 'FIRESTORE_VALIDATION_FAILED',

  // Workflow errors
  WORKFLOW_TIMEOUT: 'WORKFLOW_TIMEOUT',
  WORKFLOW_MAX_STEPS_EXCEEDED: 'WORKFLOW_MAX_STEPS_EXCEEDED',
  WORKFLOW_LOOP_DETECTED: 'WORKFLOW_LOOP_DETECTED',
  WORKFLOW_AGENT_FAILED: 'WORKFLOW_AGENT_FAILED',

  // Provider errors
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',

  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

// ----- Consolidated Config Export -----

export const Config = {
  retry: RetryConfig,
  timeout: TimeoutConfig,
  limits: WorkflowLimits,
  evaluation: EvaluationThresholds,
  abTesting: ABTestingConfig,
  telemetry: TelemetryConfig,
  labeling: LabelingConfig,
  hash: HashConfig,
  errorCodes: ErrorCodes,
} as const
