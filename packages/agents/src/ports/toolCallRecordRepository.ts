/**
 * Tool Call Record Repository Port
 *
 * Repository interface for persisting and querying tool call execution records.
 * Follows the established repository pattern from agentRepository, workflowRepository, and runRepository.
 */

import type {
  CreateToolCallRecordInput,
  RunId,
  ToolCallRecord,
  ToolCallRecordId,
  WorkflowId,
} from '../domain/models.js'

export interface ToolCallRecordRepository {
  /**
   * Create a new tool call record
   */
  createToolCallRecord(input: CreateToolCallRecordInput): Promise<ToolCallRecord>

  /**
   * Update an existing tool call record (typically to set completion status, result, error)
   */
  updateToolCallRecord(
    id: ToolCallRecordId,
    updates: Partial<ToolCallRecord>
  ): Promise<ToolCallRecord>

  /**
   * Get a single tool call record by ID
   */
  getToolCallRecord(id: ToolCallRecordId): Promise<ToolCallRecord | null>

  /**
   * Get all tool call records for a specific run
   */
  getToolCallRecordsByRun(runId: RunId): Promise<ToolCallRecord[]>

  /**
   * Get all tool call records for a specific workflow (across all runs)
   */
  getToolCallRecordsByWorkflow(workflowId: WorkflowId): Promise<ToolCallRecord[]>

  /**
   * Get all tool call records for a user (across all workflows and runs)
   */
  getToolCallRecordsByUser(userId: string): Promise<ToolCallRecord[]>

  /**
   * Delete a tool call record
   */
  deleteToolCallRecord(id: ToolCallRecordId): Promise<void>
}
