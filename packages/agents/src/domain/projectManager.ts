import type { Id } from '@lifeos/core'
import type { RunId, WorkspaceId } from './models'

export type ConversationContextId = Id<'pmContext'>
export type UserProfileId = Id<'pmProfile'>
export type RequirementId = Id<'pmRequirement'>
export type AssumptionId = Id<'pmAssumption'>
export type DecisionId = Id<'pmDecision'>
export type ConflictId = Id<'pmConflict'>
export type ConversationTurnId = Id<'pmTurn'>

export type RequirementCategory = 'functional' | 'non-functional' | 'constraint' | 'goal'
export type RequirementPriority = 'must-have' | 'should-have' | 'nice-to-have'
export type RequirementSource = 'user-stated' | 'inferred' | 'clarified'

export type AssumptionCategory = 'technical' | 'business' | 'user' | 'timeline' | 'resource'
export type AssumptionSource = 'user-stated' | 'inferred' | 'clarified'

export type ConflictType =
  | 'contradictory-requirements'
  | 'impossible-constraint'
  | 'priority-conflict'
export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical'

export type DecisionStatus = 'pending' | 'selected'

export interface Requirement {
  requirementId: RequirementId
  text: string
  category: RequirementCategory
  priority: RequirementPriority
  source: RequirementSource
  confidence: number
  extractedAtTurn: number
}

export interface Assumption {
  assumptionId: AssumptionId
  text: string
  category: AssumptionCategory
  source: AssumptionSource
  confidence: number
  validated: boolean
  extractedAtTurn: number
}

export interface DecisionRecord {
  decisionId: DecisionId
  question: string
  options?: string[]
  selectedOption?: string
  rationale?: string
  status: DecisionStatus
  decidedAtTurn: number
  decidedAtMs: number
}

export interface ConflictResolution {
  resolvedAtMs: number
  resolvedBy: string
  notes?: string
  selectedOption?: string
}

export interface Conflict {
  conflictId: ConflictId
  type: ConflictType
  severity: ConflictSeverity
  description: string
  involvedItems: string[]
  detectedAtTurn: number
  resolved: boolean
  resolution?: ConflictResolution
}

export interface ConversationTurn {
  turnId: ConversationTurnId
  turnNumber: number
  userMessage: string
  pmResponse: string
  timestampMs: number
}

export interface ConversationContext {
  contextId: ConversationContextId
  userId: string
  workspaceId?: WorkspaceId
  runId?: RunId
  requirements: Requirement[]
  assumptions: Assumption[]
  decisions: DecisionRecord[]
  conflicts: Conflict[]
  turnCount: number
  startedAtMs: number
  lastUpdatedAtMs: number
  summary?: string
  fullHistory: ConversationTurn[]
}

export interface UserProfile {
  profileId: UserProfileId
  userId: string
  expertiseLevel: 'beginner' | 'intermediate' | 'expert'
  preferredDetailLevel: 'high-level' | 'detailed' | 'technical'
  totalInteractions: number
  averageQuestionsPerSession: number
  expertCouncilUsageRate: number
  satisfactionScore: number
  createdAtMs: number
  updatedAtMs: number
}

export interface ProjectManagerConfig {
  enabled: boolean
  questioningDepth: 'minimal' | 'standard' | 'thorough'
  autoUseExpertCouncil: boolean
  expertCouncilThreshold: number
  qualityGateThreshold: number
  requireAssumptionValidation: boolean
  enableConflictDetection: boolean
  enableUserProfiling: boolean
}
