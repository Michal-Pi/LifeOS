import type {
  AgentConfig,
  AgentId,
  CreateAgentInput,
  UpdateAgentInput,
  AgentRole,
  ModelProvider,
} from '../domain/models'

export interface AgentRepository {
  create(userId: string, input: CreateAgentInput): Promise<AgentConfig>
  update(userId: string, agentId: AgentId, updates: UpdateAgentInput): Promise<AgentConfig>
  delete(userId: string, agentId: AgentId): Promise<void>
  get(userId: string, agentId: AgentId): Promise<AgentConfig | null>
  list(
    userId: string,
    options?: {
      role?: AgentRole
      provider?: ModelProvider
      activeOnly?: boolean
    }
  ): Promise<AgentConfig[]>
  findByConfigHash?(userId: string, hash: string): Promise<AgentConfig | null>
}
