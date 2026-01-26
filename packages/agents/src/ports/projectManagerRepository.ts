import type {
  Assumption,
  Conflict,
  ConversationContext,
  ConversationContextId,
  ConversationTurn,
  DecisionRecord,
  Requirement,
  UserProfile,
} from '../domain/projectManager'
import type { WorkspaceId, RunId } from '../domain/models'

export interface ProjectManagerRepository {
  createContext(
    userId: string,
    workspaceId?: WorkspaceId,
    runId?: RunId
  ): Promise<ConversationContext>
  getContext(userId: string, contextId: ConversationContextId): Promise<ConversationContext | null>
  getActiveContext(
    userId: string,
    workspaceId?: WorkspaceId
  ): Promise<ConversationContext | null>
  updateContext(
    userId: string,
    contextId: ConversationContextId,
    updates: Partial<ConversationContext>
  ): Promise<ConversationContext>
  addTurn(userId: string, contextId: ConversationContextId, turn: ConversationTurn): Promise<void>
  addRequirement(
    userId: string,
    contextId: ConversationContextId,
    requirement: Requirement
  ): Promise<void>
  addAssumption(
    userId: string,
    contextId: ConversationContextId,
    assumption: Assumption
  ): Promise<void>
  addDecision(
    userId: string,
    contextId: ConversationContextId,
    decision: DecisionRecord
  ): Promise<void>
  addConflict(userId: string, contextId: ConversationContextId, conflict: Conflict): Promise<void>

  getProfile(userId: string): Promise<UserProfile | null>
  createProfile(userId: string): Promise<UserProfile>
  updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile>

  getDecisionHistory(userId: string, limit?: number): Promise<DecisionRecord[]>
  getConflictHistory(userId: string, limit?: number): Promise<Conflict[]>
}
