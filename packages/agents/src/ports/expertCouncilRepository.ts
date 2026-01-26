import type { ExpertCouncilTurn, RunId, WorkspaceId, CouncilAnalytics } from '../domain/models'

export interface ExpertCouncilRepository {
  // Turn management
  createTurn(userId: string, turn: ExpertCouncilTurn): Promise<ExpertCouncilTurn>
  getTurn(userId: string, runId: RunId, turnId: string): Promise<ExpertCouncilTurn | null>
  listTurns(userId: string, runId: RunId): Promise<ExpertCouncilTurn[]>

  // Cache management
  getCachedTurn(userId: string, cacheKey: string): Promise<ExpertCouncilTurn | null>
  setCachedTurn(
    userId: string,
    cacheKey: string,
    turn: ExpertCouncilTurn,
    ttlHours: number
  ): Promise<void>
  invalidateCache(userId: string, cacheKey: string): Promise<void>

  // Analytics
  getAnalytics(userId: string, workspaceId: WorkspaceId): Promise<CouncilAnalytics>
  recordFeedback(
    userId: string,
    runId: RunId,
    turnId: string,
    feedback: ExpertCouncilTurn['userFeedback']
  ): Promise<void>
}
