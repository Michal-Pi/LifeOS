import type {
  WorkoutSession,
  SessionId,
  CreateSessionInput,
  UpdateSessionInput,
  WorkoutContext,
} from '../domain/models'

export interface WorkoutSessionRepository {
  create(userId: string, input: CreateSessionInput): Promise<WorkoutSession>
  update(userId: string, sessionId: SessionId, updates: UpdateSessionInput): Promise<WorkoutSession>
  delete(userId: string, sessionId: SessionId): Promise<void>
  get(userId: string, sessionId: SessionId): Promise<WorkoutSession | null>
  getByDate(userId: string, dateKey: string): Promise<WorkoutSession[]>
  getByDateAndContext(
    userId: string,
    dateKey: string,
    context: WorkoutContext
  ): Promise<WorkoutSession | null>
  listForDateRange(userId: string, startDate: string, endDate: string): Promise<WorkoutSession[]>
}
