/**
 * Example Library Repository Port
 *
 * Interface for persisting and retrieving example libraries and examples.
 * Libraries are independent of agents and can be managed separately.
 */

import type {
  ExampleLibrary,
  ExampleLibraryId,
  FewShotExample,
  FewShotExampleId,
  ExampleSelectionStrategy,
  SelectedExamples,
  PendingPromotion,
  ExampleLibraryStats,
  ExampleLibraryVersion,
} from '../domain/exampleLibrary'

// ----- Input Types -----

export interface CreateExampleLibraryInput {
  name: string
  description: string
  workflowType: string
  taskType: string
  defaultSelectionStrategy?: ExampleSelectionStrategy
  defaultMaxExamples?: number
}

export interface UpdateExampleLibraryInput {
  name?: string
  description?: string
  defaultSelectionStrategy?: ExampleSelectionStrategy
  defaultMaxExamples?: number
  isArchived?: boolean
}

export interface CreateExampleInput {
  input: string
  output: string
  qualityScore?: number
  evalScores?: Record<string, number>
  source?: 'manual' | 'auto_promoted' | 'imported'
  metadata?: Record<string, unknown>
  tags?: string[]
}

export interface UpdateExampleInput {
  input?: string
  output?: string
  qualityScore?: number
  evalScores?: Record<string, number>
  metadata?: Record<string, unknown>
  tags?: string[]
  isActive?: boolean
}

export interface ExampleSelectionOptions {
  maxExamples: number
  strategy: ExampleSelectionStrategy
  inputForSimilarity?: string // Required if strategy is 'similarity'
  excludeIds?: FewShotExampleId[]
  minQualityScore?: number
  requiredTags?: string[]
}

// ----- Repository Interface -----

export interface ExampleLibraryRepository {
  // ----- Library CRUD -----

  createLibrary(userId: string, input: CreateExampleLibraryInput): Promise<ExampleLibrary>

  getLibrary(userId: string, libraryId: ExampleLibraryId): Promise<ExampleLibrary | null>

  listLibraries(
    userId: string,
    filters?: {
      workflowType?: string
      taskType?: string
      includeArchived?: boolean
    }
  ): Promise<ExampleLibrary[]>

  updateLibrary(
    userId: string,
    libraryId: ExampleLibraryId,
    updates: UpdateExampleLibraryInput
  ): Promise<ExampleLibrary>

  deleteLibrary(userId: string, libraryId: ExampleLibraryId): Promise<void>

  // ----- Library Versioning -----

  createSnapshot(
    userId: string,
    libraryId: ExampleLibraryId,
    description?: string
  ): Promise<ExampleLibraryVersion>

  listVersions(userId: string, libraryId: ExampleLibraryId): Promise<ExampleLibraryVersion[]>

  restoreVersion(
    userId: string,
    libraryId: ExampleLibraryId,
    version: number
  ): Promise<ExampleLibrary>

  // ----- Example CRUD -----

  createExample(
    userId: string,
    libraryId: ExampleLibraryId,
    input: CreateExampleInput
  ): Promise<FewShotExample>

  getExample(
    userId: string,
    libraryId: ExampleLibraryId,
    exampleId: FewShotExampleId
  ): Promise<FewShotExample | null>

  listExamples(
    userId: string,
    libraryId: ExampleLibraryId,
    filters?: {
      isActive?: boolean
      source?: 'manual' | 'auto_promoted' | 'imported'
      minQualityScore?: number
      tags?: string[]
    }
  ): Promise<FewShotExample[]>

  updateExample(
    userId: string,
    libraryId: ExampleLibraryId,
    exampleId: FewShotExampleId,
    updates: UpdateExampleInput
  ): Promise<FewShotExample>

  deleteExample(
    userId: string,
    libraryId: ExampleLibraryId,
    exampleId: FewShotExampleId
  ): Promise<void>

  // ----- Example Selection -----

  selectExamples(
    userId: string,
    libraryIds: ExampleLibraryId[],
    options: ExampleSelectionOptions
  ): Promise<SelectedExamples>

  recordExampleUsage(
    userId: string,
    libraryId: ExampleLibraryId,
    exampleId: FewShotExampleId
  ): Promise<void>

  // ----- Auto-Promotion -----

  createPendingPromotion(
    userId: string,
    libraryId: ExampleLibraryId,
    runId: string,
    input: string,
    output: string,
    qualityScore: number,
    evalScores?: Record<string, number>
  ): Promise<PendingPromotion>

  listPendingPromotions(userId: string, libraryId?: ExampleLibraryId): Promise<PendingPromotion[]>

  approvePendingPromotion(
    userId: string,
    promotionId: string,
    reviewerNote?: string
  ): Promise<FewShotExample>

  rejectPendingPromotion(userId: string, promotionId: string, reviewerNote?: string): Promise<void>

  // ----- Statistics -----

  getLibraryStats(userId: string, libraryId: ExampleLibraryId): Promise<ExampleLibraryStats>

  // ----- Batch Operations -----

  bulkUpdateExamples(
    userId: string,
    libraryId: ExampleLibraryId,
    exampleIds: FewShotExampleId[],
    updates: UpdateExampleInput
  ): Promise<number> // Returns count of updated examples

  pruneExamples(
    userId: string,
    libraryId: ExampleLibraryId,
    options: {
      maxQualityScore?: number // Remove examples below this score
      maxAge?: number // Remove examples older than N days
      keepMinimum?: number // Always keep at least N examples
    }
  ): Promise<number> // Returns count of deactivated examples
}
