/**
 * Example Library Domain Types
 *
 * Example libraries are independent entities that agents can reference by ID.
 * This separation enables:
 * - Independent A/B testing of prompts vs. examples
 * - Example reuse across multiple agents
 * - Separate versioning and lifecycle management
 * - Clear attribution for quality improvements
 */

import type { Id } from '@lifeos/core'

// ----- IDs -----

export type ExampleLibraryId = Id<'exampleLibrary'>
export type FewShotExampleId = Id<'fewShotExample'>

// ----- Example Selection Strategy -----

/**
 * Strategy for selecting examples from a library
 */
export type ExampleSelectionStrategy =
  | 'random' // Random sampling from active examples
  | 'top_scored' // Highest quality scores first
  | 'similarity' // Semantic similarity to current input (requires embeddings)
  | 'recent' // Most recently added examples first

// ----- Example Source -----

/**
 * How the example was added to the library
 */
export type ExampleSource =
  | 'manual' // Manually curated by user
  | 'auto_promoted' // Automatically promoted from high-scoring outputs
  | 'imported' // Imported from external source

// ----- Few-Shot Example -----

/**
 * A single example in an example library
 */
export interface FewShotExample {
  exampleId: FewShotExampleId
  libraryId: ExampleLibraryId

  // Core content
  input: string
  output: string

  // Quality metrics
  qualityScore: number // 0-1 aggregate score
  evalScores?: Record<string, number> // Per-criterion scores from LLM-as-Judge

  // Metadata
  source: ExampleSource
  metadata?: Record<string, unknown> // Task-specific metadata (e.g., lens, operator type)
  tags?: string[] // User-defined tags for filtering

  // Lifecycle
  isActive: boolean // Can be disabled without deletion
  usageCount: number // How many times this example has been used
  lastUsedAtMs?: number

  // Timestamps
  createdAtMs: number
  updatedAtMs: number
}

// ----- Example Library -----

/**
 * A collection of few-shot examples for a specific task type
 *
 * Libraries are independent entities that agents reference by ID,
 * enabling isolated A/B testing of prompts vs. examples.
 */
export interface ExampleLibrary {
  libraryId: ExampleLibraryId
  userId: string

  // Identity
  name: string
  description: string

  // Categorization
  workflowType: string // 'deep_research', 'dialectical', 'expert_council', etc.
  taskType: string // 'research_query', 'synthesis', 'negation', etc.

  // Configuration
  defaultSelectionStrategy: ExampleSelectionStrategy
  defaultMaxExamples: number

  // Versioning
  version: number
  previousVersions?: ExampleLibraryVersion[]

  // Statistics (denormalized for quick access)
  exampleCount: number
  activeExampleCount: number
  avgQualityScore: number

  // Lifecycle
  isArchived: boolean

  // Timestamps
  createdAtMs: number
  updatedAtMs: number
}

/**
 * A snapshot of library state for version history
 */
export interface ExampleLibraryVersion {
  version: number
  exampleIds: FewShotExampleId[]
  snapshotAtMs: number
  description?: string // Optional description of changes
}

// ----- Agent Example Configuration -----

/**
 * Configuration for how an agent uses example libraries
 *
 * Stored as part of AgentConfig, references libraries by ID
 */
export interface AgentExampleConfig {
  libraryIds: ExampleLibraryId[] // Which libraries to pull from (in priority order)
  maxExamples: number // Maximum examples to include in prompt
  selectionStrategy: ExampleSelectionStrategy // How to select examples

  // Optional overrides per library
  libraryOverrides?: Record<
    string,
    {
      maxExamples?: number
      selectionStrategy?: ExampleSelectionStrategy
      weight?: number // Relative weight when pulling from multiple libraries
    }
  >
}

// ----- Example Selection Result -----

/**
 * Result of selecting examples for a prompt
 */
export interface SelectedExamples {
  examples: FewShotExample[]
  libraryIds: ExampleLibraryId[]
  selectionStrategy: ExampleSelectionStrategy
  totalAvailable: number
  selectedCount: number
}

// ----- Example Promotion -----

/**
 * Criteria for auto-promoting outputs to examples
 */
export interface PromotionCriteria {
  minQualityScore: number // Minimum aggregate score (0-1)
  minCriterionScores?: Record<string, number> // Per-criterion minimums
  requireManualApproval: boolean // If true, mark as pending instead of auto-adding
  maxDailyPromotions?: number // Rate limit auto-promotions
}

/**
 * A pending example promotion for manual review
 */
export interface PendingPromotion {
  promotionId: string
  libraryId: ExampleLibraryId
  runId: string
  stepIndex?: number

  // Proposed example content
  input: string
  output: string
  qualityScore: number
  evalScores?: Record<string, number>

  // Status
  status: 'pending' | 'approved' | 'rejected'
  reviewedAtMs?: number
  reviewerNote?: string

  createdAtMs: number
}

// ----- Example Library Statistics -----

/**
 * Aggregated statistics for an example library
 */
export interface ExampleLibraryStats {
  libraryId: ExampleLibraryId

  // Counts
  totalExamples: number
  activeExamples: number
  manualExamples: number
  autoPromotedExamples: number

  // Quality
  avgQualityScore: number
  qualityDistribution: {
    excellent: number // >= 0.9
    good: number // >= 0.7
    fair: number // >= 0.5
    poor: number // < 0.5
  }

  // Usage
  totalUsageCount: number
  usageLast7Days: number
  usageLast30Days: number

  // Timeline
  oldestExampleMs: number
  newestExampleMs: number
  lastUsedMs?: number

  computedAtMs: number
}
