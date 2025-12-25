export interface AgentCommand {
  id: string
  payload: Record<string, unknown>
}

export interface AgentPort {
  enqueue(_command: AgentCommand): Promise<void>
}
