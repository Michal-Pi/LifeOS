import type {
  CanonicalInterventionSession,
  SessionId,
  CreateSessionInput,
  CompleteSessionInput,
  FeelingState,
} from '../domain/models'

export interface SessionRepository {
  create(userId: string, input: CreateSessionInput): Promise<CanonicalInterventionSession>
  complete(
    userId: string,
    sessionId: SessionId,
    completion: CompleteSessionInput
  ): Promise<CanonicalInterventionSession>
  get(userId: string, sessionId: SessionId): Promise<CanonicalInterventionSession | null>
  listForDate(userId: string, dateKey: string): Promise<CanonicalInterventionSession[]>
  listRecent(userId: string, limit?: number): Promise<CanonicalInterventionSession[]>
  listForDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CanonicalInterventionSession[]>
}
