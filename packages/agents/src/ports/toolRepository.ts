import type { ToolDefinition, ToolId, CreateToolInput } from '../domain/models'

export interface ToolRepository {
  create(input: CreateToolInput): Promise<ToolDefinition>
  update(toolId: ToolId, updates: Partial<CreateToolInput>): Promise<ToolDefinition>
  get(userId: string, toolId: ToolId): Promise<ToolDefinition | null>
  list(options?: { userId?: string; module?: string }): Promise<ToolDefinition[]>
  delete(userId: string, toolId: ToolId): Promise<void>
}
